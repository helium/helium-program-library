import * as anchor from "@anchor-lang/core";
import {
  cronJobKey,
  cronJobTransactionKey,
  PROGRAM_ID as CRON_PROGRAM,
} from "@helium/cron-sdk";
import {
  entityCronAuthorityKey,
  HNT_REWARDS_ORACLE_URL,
  HNT_REWARDS_ORACLE_URL_DEVNET,
  init as initHplCrons,
  remoteCronTransactionSpace,
} from "@helium/hpl-crons-sdk";
import {
  batchInstructionsToTxsWithPriorityFee,
  bulkSendTransactions,
  chunks,
} from "@helium/spl-utils";
import { customSignerKey } from "@helium/tuktuk-sdk";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import fs from "fs";
import os from "os";
import yargs from "yargs/yargs";

// Temporary: drives hpl-crons `backfill_entity_claim_wallet_v0`, and goes away with it.
const BACKFILL_SIGNER = new PublicKey(
  "hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW"
);
const FEE_MARGIN_LAMPORTS = 0.05 * LAMPORTS_PER_SOL;

/**
 * Whether the backfill adds the wallet claim to an existing cron, or why it
 * skips it. A cron removed from queue is backfilled too.
 */
export const backfillSelection = ({
  nextTransactionId,
  transactionExists,
}: {
  nextTransactionId: number;
  transactionExists: boolean;
}): "hasClaims" | "transactionExists" | "ready" =>
  nextTransactionId !== 0
    ? "hasClaims"
    : transactionExists
      ? "transactionExists"
      : "ready";

/**
 * A system-owned account at the transaction PDA, such as one someone pre-funded, does not count: the program's init still succeeds on it.
 */
export const cronTransactionExists = (
  info: { owner: PublicKey } | null | undefined
): boolean => !!info?.owner.equals(CRON_PROGRAM);

/**
 * Lamports the backfill signer sends a cron so it keeps at least minRuns runs,
 * at 2 tasks per run. A cron removed from queue gets the claim's rent only: it
 * does not run until requeued.
 */
export const backfillTopUp = ({
  removedFromQueue,
  spendable,
  minCrankReward,
  minRuns,
}: {
  removedFromQueue: boolean;
  spendable: anchor.BN;
  minCrankReward: anchor.BN;
  minRuns: number;
}): anchor.BN =>
  removedFromQueue
    ? new anchor.BN(0)
    : anchor.BN.max(
        minCrankReward.muln(2).muln(minRuns).sub(spendable),
        new anchor.BN(0)
      );

/** Lamports the backfill signer needs: top-ups, claim rent, and a fee margin. */
export const backfillRequiredLamports = ({
  topUpLamports,
  rentLamports,
}: {
  topUpLamports: anchor.BN;
  rentLamports: number;
}): anchor.BN =>
  topUpLamports
    .add(new anchor.BN(rentLamports))
    .add(new anchor.BN(FEE_MARGIN_LAMPORTS));

const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

/**
 * The oracle URL hpl-crons compiles in for a cluster, which the claim the
 * backfill adds holds. Only a devnet build uses the devnet URL.
 */
export const backfillOracleUrl = (genesisHash: string): string =>
  genesisHash === DEVNET_GENESIS_HASH
    ? HNT_REWARDS_ORACLE_URL_DEVNET
    : HNT_REWARDS_ORACLE_URL;

export async function run(args: any = process.argv) {
  const yarg = yargs(args).options({
    wallet: {
      alias: "k",
      describe:
        "Anchor wallet keypair. Must be the backfill signer with --commit; a dry run still needs a keypair file",
      default: `${os.homedir()}/.config/solana/id.json`,
    },
    url: {
      alias: "u",
      default: "http://127.0.0.1:8899",
      describe: "The solana url",
    },
    owners: {
      type: "string",
      required: true,
      describe: "JSON file holding an array of cron owner wallet addresses",
    },
    idl: {
      type: "string",
      required: true,
      describe:
        "hpl_crons IDL that includes backfill_entity_claim_wallet_v0 (the on-chain IDL may lag the program)",
    },
    minRuns: {
      type: "number",
      describe:
        "Top each backfilled cron up so it has at least this many runs left after the backfill. 0 turns top-ups off",
      default: 365,
    },
    commit: {
      type: "boolean",
      describe: "Actually send transactions. Otherwise dry-run",
      default: false,
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const connection = provider.connection;
  const oracleUrl = backfillOracleUrl(await connection.getGenesisHash());

  if (argv.commit && !provider.wallet.publicKey.equals(BACKFILL_SIGNER)) {
    throw new Error(
      `Wallet ${provider.wallet.publicKey.toBase58()} is not the backfill signer ${BACKFILL_SIGNER.toBase58()}`
    );
  }

  const program = await initHplCrons(
    provider,
    undefined,
    JSON.parse(fs.readFileSync(argv.idl, "utf8"))
  );
  const owners = [
    ...new Set<string>(JSON.parse(fs.readFileSync(argv.owners, "utf8"))),
  ].map((o) => new PublicKey(o));

  const targets = owners.map((wallet) => {
    const authority = entityCronAuthorityKey(wallet)[0];
    const cronJob = cronJobKey(authority, 0)[0];
    return {
      wallet,
      authority,
      cronJob,
      cronJobTransaction: cronJobTransactionKey(cronJob, 0)[0],
    };
  });

  const fetchAll = async (keys: PublicKey[]) =>
    (
      await Promise.all(
        chunks(keys, 100).map((chunk) =>
          connection.getMultipleAccountsInfo(chunk)
        )
      )
    ).flat();

  const [cronAccounts, transactionAccounts] = await Promise.all([
    fetchAll(targets.map((t) => t.cronJob)),
    fetchAll(targets.map((t) => t.cronJobTransaction)),
  ]);

  const skipped = {
    missing: 0,
    hasClaims: 0,
    transactionExists: 0,
  };
  const ready: ((typeof targets)[number] & {
    taskQueue: PublicKey;
    notScheduled: boolean;
    removedFromQueue: boolean;
    cronLamports: number;
    cronDataLength: number;
  })[] = [];
  targets.forEach((target, i) => {
    const info = cronAccounts[i];
    if (!info || !info.owner.equals(CRON_PROGRAM)) {
      skipped.missing++;
      return;
    }
    const cron = program.coder.accounts.decode("cronJobV0", info.data);
    const selection = backfillSelection({
      nextTransactionId: cron.nextTransactionId,
      transactionExists: cronTransactionExists(transactionAccounts[i]),
    });
    if (selection !== "ready") {
      skipped[selection]++;
    } else {
      ready.push({
        ...target,
        taskQueue: cron.taskQueue,
        notScheduled: cron.nextScheduleTask.equals(PublicKey.default),
        removedFromQueue: cron.removedFromQueue,
        cronLamports: info.lamports,
        cronDataLength: info.data.length,
      });
    }
  });

  // The oracle skips a wallet claim when its claim_payer holds less than rent-exempt
  // minimum plus a crank reward per hotspot and one more. One hotspot is the floor.
  const taskQueues = [...new Set(ready.map((r) => r.taskQueue.toBase58()))];
  const queues = await program.account.taskQueueV0.fetchMultiple(taskQueues);
  const minCrankRewards = new Map<string, anchor.BN>();
  taskQueues.forEach((taskQueue, i) => {
    minCrankRewards.set(taskQueue, queues[i]!.minCrankReward);
  });
  const walletMinRent = await connection.getMinimumBalanceForRentExemption(0);
  const claimPayers = await fetchAll(
    ready.map(
      (r) =>
        customSignerKey(r.taskQueue, [
          Buffer.from("claim_payer"),
          r.wallet.toBuffer(),
        ])[0]
    )
  );
  const underfunded = ready.filter((r, i) =>
    new anchor.BN(claimPayers[i]?.lamports ?? 0).lt(
      new anchor.BN(walletMinRent).add(
        minCrankRewards.get(r.taskQueue.toBase58())!.muln(2)
      )
    )
  ).length;

  const rentCache = new Map<number, number>();
  const rentFor = async (space: number) => {
    let rent = rentCache.get(space);
    if (rent === undefined) {
      rent = await connection.getMinimumBalanceForRentExemption(space);
      rentCache.set(space, rent);
    }
    return rent;
  };

  let rentLamports = 0;
  for (const r of ready) {
    rentLamports += await rentFor(
      remoteCronTransactionSpace(
        `${oracleUrl}/v1/tuktuk/wallet/${r.wallet.toBase58()}`
      )
    );
  }

  // After the backfill each cron run pays the cron job for 2 tasks (schedule task + the claim)
  // instead of 1, at the task queue's minCrankReward each.
  const runsBefore: anchor.BN[] = [];
  const runsAfter: anchor.BN[] = [];
  // Lamports the backfill signer sends each cron (see backfillTopUp).
  const topUps: anchor.BN[] = [];
  for (const r of ready) {
    const spendable = anchor.BN.max(
      new anchor.BN(r.cronLamports).sub(
        new anchor.BN(await rentFor(r.cronDataLength))
      ),
      new anchor.BN(0)
    );
    const m = minCrankRewards.get(r.taskQueue.toBase58())!;
    runsBefore.push(spendable.div(m));
    runsAfter.push(spendable.div(m.muln(2)));
    topUps.push(
      backfillTopUp({
        removedFromQueue: r.removedFromQueue,
        spendable,
        minCrankReward: m,
        minRuns: argv.minRuns,
      })
    );
  }
  const topUpLamports = topUps.reduce((a, b) => a.add(b), new anchor.BN(0));
  const toppedUp = topUps.filter((t) => !t.isZero()).length;
  const minMedian = (values: anchor.BN[]) => {
    if (values.length === 0) return "n/a / n/a";
    const sorted = [...values].sort((a, b) => a.cmp(b));
    return `${sorted[0].toString()} / ${sorted[
      Math.floor(sorted.length / 2)
    ].toString()}`;
  };
  const signerBalance = await connection.getBalance(BACKFILL_SIGNER);

  console.log(`Owners: ${owners.length}`);
  console.log(`Skipped, no cron: ${skipped.missing}`);
  console.log(`Skipped, cron already has claims: ${skipped.hasClaims}`);
  console.log(
    `Skipped, transaction 0 already exists: ${skipped.transactionExists}`
  );
  console.log(`To backfill: ${ready.length}`);
  console.log(
    `  of which no schedule task set: ${
      ready.filter((r) => r.notScheduled).length
    }`
  );
  console.log(
    `  of which removed from queue, rent only: ${
      ready.filter((r) => r.removedFromQueue).length
    }`
  );
  console.log(
    `  of which claim_payer below the one-hotspot floor (will claim nothing until topped up): ${underfunded}`
  );
  console.log(
    `  cron runs left at current funding (min / median): before ${minMedian(
      runsBefore
    )}, after backfill ${minMedian(runsAfter)}`
  );
  console.log(
    `  of which topped up to ${argv.minRuns} runs: ${toppedUp}, for ${
      topUpLamports.toNumber() / 1e9
    } SOL`
  );
  console.log(
    `Paid by ${BACKFILL_SIGNER.toBase58()}: ${rentLamports / 1e9} SOL rent + ${
      topUpLamports.toNumber() / 1e9
    } SOL top-ups, plus fees. Balance: ${signerBalance / 1e9} SOL`
  );

  const signerCovers = new anchor.BN(signerBalance).gte(
    backfillRequiredLamports({ topUpLamports, rentLamports })
  );
  if (!argv.commit) {
    console.log(
      `Signer balance covers rent, top-ups, and fee margin: ${signerCovers}`
    );
    console.log("Dry run. Re-run with --commit to send.");
    return;
  }
  if (!signerCovers) {
    throw new Error(
      "Backfill signer cannot pay the rent, top-ups, and fee margin"
    );
  }

  // A cron's top-up shares its backfill's transaction, so a re-run never tops up a cron twice:
  // a backfilled cron has a claim and is skipped.
  const instructions: TransactionInstruction[][] = await Promise.all(
    ready.map(async (r, i) => [
      await program.methods
        .backfillEntityClaimWalletV0()
        .accountsPartial({
          payer: BACKFILL_SIGNER,
          wallet: r.wallet,
          cronJob: r.cronJob,
          cronJobTransaction: r.cronJobTransaction,
        })
        .instruction(),
      ...(topUps[i].isZero()
        ? []
        : [
            SystemProgram.transfer({
              fromPubkey: BACKFILL_SIGNER,
              toPubkey: r.cronJob,
              lamports: BigInt(topUps[i].toString()),
            }),
          ]),
    ])
  );
  const txns = await batchInstructionsToTxsWithPriorityFee(
    provider,
    instructions,
    { useFirstEstimateForAll: true, computeUnitLimit: 600000 }
  );
  await bulkSendTransactions(provider, txns, (status) => {
    console.log(
      `Sending ${status.currentBatchProgress} / ${status.currentBatchSize} in batch. ${status.totalProgress} / ${txns.length}`
    );
  });
  console.log("Done. Re-run without --commit to confirm nothing is left.");
}
