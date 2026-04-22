import fs from "fs";
import BN from "bn.js";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { createMemoInstruction } from "@solana/spl-memo";
import { init as initHplCrons } from "@helium/hpl-crons-sdk";
import { init as initProposal } from "@helium/proposal-sdk";
import { init as initStateController } from "@helium/state-controller-sdk";
import {
  compileTransaction,
  customSignerKey,
  RemoteTaskTransactionV0,
  init as initTuktuk,
} from "@helium/tuktuk-sdk";
import {
  init as initVsr,
  positionKey,
  proxyVoteMarkerKey,
  voteMarkerKey,
} from "@helium/voter-stake-registry-sdk";
import { sign } from "tweetnacl";
import { sequelize } from "@/lib/db";
import { env } from "@/lib/env";
import { createSolanaConnection } from "@/lib/solana";
import { deepCamelCaseKeys } from "@/lib/utils/camel-case";
import { publicProcedure } from "@/server/api/procedures";

const HNT_REGISTRAR = new PublicKey(
  "BMnWRWZrWqb6JMKznaDqNxWaWAHoaTzVabM6Qwyh3WKz",
);
const HELIUM_PROXY_CONFIG = new PublicKey(
  "ADWefNt1foP9YJamZFjcUwuMUanw29bEhtsHBEbfKpWZ",
);
const MAX_VOTES_PER_TASK = 1;
const MARKERS_TO_CHECK = 10;

let cachedKeypair: Keypair | null = null;
function loadServiceKeypair(): Keypair {
  if (cachedKeypair) return cachedKeypair;
  if (!env.ANCHOR_WALLET) {
    throw new Error("ANCHOR_WALLET env var is required for proxy-vote signing");
  }
  cachedKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(env.ANCHOR_WALLET).toString())),
  );
  return cachedKeypair;
}

function choicesEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((v, i) => v === sortedB[i]);
}

interface NeedsVoteRow {
  asset: string;
  proxyAssignment: string;
  delegatedPosition?: string;
}

export const proxyVote = publicProcedure.governance.proxyVote.handler(
  async ({ input, errors }) => {
    const { proposalKey, wallet, taskQueue, task, taskQueuedAt } = input;

    const proposal = new PublicKey(proposalKey);
    const walletPk = new PublicKey(wallet);
    const taskQueuePk = new PublicKey(taskQueue);
    const taskPk = new PublicKey(task);
    const taskQueuedAtBn = new BN(String(taskQueuedAt));

    const keypair = loadServiceKeypair();

    const { provider } = createSolanaConnection(wallet);
    const vsrProgram = await initVsr(provider);
    const tuktukProgram = await initTuktuk(provider);
    const proposalProgram = await initProposal(provider);
    const stateControllerProgram = await initStateController(provider);
    const hplCronsProgram = await initHplCrons(provider);

    const taskQueueAcc =
      await tuktukProgram.account.taskQueueV0.fetch(taskQueuePk);
    const proxyVoteMarker = proxyVoteMarkerKey(walletPk, proposal)[0];
    const proxyMarkerAcc =
      await vsrProgram.account.proxyMarkerV0.fetch(proxyVoteMarker);
    const choices = proxyMarkerAcc.choices;
    const proposalAccount =
      await proposalProgram.account.proposalV0.fetch(proposal);
    const proposalConfig = await proposalProgram.account.proposalConfigV0.fetch(
      proposalAccount.proposalConfig,
    );
    const resolutionSettings =
      await stateControllerProgram.account.resolutionSettingsV0.fetch(
        proposalConfig.stateController,
      );
    const endTs = proposalAccount.state.resolved
      ? new BN(proposalAccount.state.resolved.endTs)
      : new BN(proposalAccount.state.voting!.startTs).add(
          resolutionSettings.settings.nodes.find(
            (node: { offsetFromStartTs?: { offset: BN } }) =>
              typeof node.offsetFromStartTs !== "undefined",
          )?.offsetFromStartTs?.offset ?? new BN(0),
        );

    const [rawRows] = await sequelize.query(`
SELECT
  pa.asset,
  pa.address as proxy_assignment,
  dp.address as delegated_position
FROM proxy_assignments pa
JOIN positions p ON p.mint = pa.asset AND p.registrar = '${HNT_REGISTRAR.toBase58()}'
LEFT OUTER JOIN vote_markers vm ON vm.mint = pa.asset AND (
  vm.registrar = '${HNT_REGISTRAR.toBase58()}' AND vm.proposal = '${proposal.toBase58()}'
)
LEFT OUTER JOIN delegated_positions dp ON dp.mint = pa.asset
WHERE pa.proxy_config = '${HELIUM_PROXY_CONFIG.toBase58()}' AND pa.voter = '${walletPk.toBase58()}' AND pa.index > 0 AND pa.expiration_time > FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)) AND (
  vm is NULL
  OR (
    vm.proxy_index >= pa.index AND
    (
      NOT vm.choices <@ ARRAY[${choices.join(",")}]::integer[] OR
      NOT vm.choices @> ARRAY[${choices.join(",")}]::integer[]
    )
  )
)
LIMIT ${MARKERS_TO_CHECK}
    `);
    const needsVoteRaw = (rawRows as unknown[]).map((row) =>
      deepCamelCaseKeys(row as Record<string, unknown>),
    ) as unknown as NeedsVoteRow[];

    const needsVote: NeedsVoteRow[] = [];
    for (const vote of needsVoteRaw) {
      if (needsVote.length >= MAX_VOTES_PER_TASK) break;
      const marker = voteMarkerKey(new PublicKey(vote.asset), proposal)[0];
      const markerAccount =
        await vsrProgram.account.voteMarkerV0.fetchNullable(marker);
      if (!markerAccount || !choicesEqual(markerAccount.choices, choices)) {
        needsVote.push(vote);
      }
    }

    if (needsVote.length === 0 && needsVoteRaw.length === MARKERS_TO_CHECK) {
      throw errors.BAD_REQUEST({
        message:
          "Indexer is still processing recent transactions, please retry later",
      });
    }

    const [pdaWallet, bump] = customSignerKey(taskQueuePk, [
      Buffer.from("vote_payer"),
      walletPk.toBuffer(),
    ]);
    const bumpBuffer = Buffer.alloc(1);
    bumpBuffer.writeUint8(bump);

    const instructions: TransactionInstruction[] = [];
    if (needsVote.length === 0) {
      instructions.push(
        createMemoInstruction(
          `Voting done for voter ${walletPk.toBase58()} proposal ${proposal.toBase58()}`,
          [pdaWallet],
        ),
      );
    } else {
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: pdaWallet,
          toPubkey: taskPk,
          lamports:
            2 * taskQueueAcc.minCrankReward.toNumber() * needsVote.length,
        }),
      );

      const voteIxGroups = await Promise.all(
        needsVote.map(async (vote) => {
          const group: TransactionInstruction[] = [];
          const {
            instruction: countIx,
            pubkeys: { marker, position },
          } = await vsrProgram.methods
            .countProxyVoteV0()
            .accountsPartial({
              payer: pdaWallet,
              proxyMarker: proxyVoteMarker,
              voter: walletPk,
              proxyAssignment: new PublicKey(vote.proxyAssignment),
              registrar: HNT_REGISTRAR,
              position: positionKey(new PublicKey(vote.asset))[0],
              proposal,
              proposalConfig: proposalAccount.proposalConfig,
              stateController: proposalConfig.stateController,
              onVoteHook: proposalConfig.onVoteHook,
            })
            .prepare();
          group.push(countIx);
          const closeIx = await hplCronsProgram.methods
            .requeueRelinquishExpiredVoteMarkerV0({ triggerTs: endTs })
            .accounts({ marker: marker!, position: position! })
            .instruction();
          group.push(closeIx);
          return group;
        }),
      );
      for (const group of voteIxGroups) instructions.push(...group);

      instructions.push(
        await hplCronsProgram.methods
          .requeueProxyVoteV0()
          .accountsPartial({ marker: proxyVoteMarker })
          .instruction(),
      );
    }

    const { transaction, remainingAccounts } = await compileTransaction(
      instructions,
      [[Buffer.from("vote_payer"), walletPk.toBuffer(), bumpBuffer]],
    );
    const remoteTx = new RemoteTaskTransactionV0({
      task: taskPk,
      taskQueuedAt: taskQueuedAtBn,
      transaction: {
        ...transaction,
        accounts: remainingAccounts.map((acc) => acc.pubkey),
      },
    });
    const serialized = await RemoteTaskTransactionV0.serialize(
      tuktukProgram.coder.accounts,
      remoteTx,
    );

    return {
      transaction: serialized.toString("base64"),
      signature: Buffer.from(
        sign.detached(Uint8Array.from(serialized), keypair.secretKey),
      ).toString("base64"),
      remainingAccounts: remainingAccounts.map((acc) => ({
        pubkey: acc.pubkey.toBase58(),
        isSigner: acc.isSigner,
        isWritable: acc.isWritable,
      })),
    };
  },
);
