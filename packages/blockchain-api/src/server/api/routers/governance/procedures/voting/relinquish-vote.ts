import { publicProcedure } from "@/server/api/procedures";
import { createSolanaConnection, getCluster } from "@/lib/solana";
import { getTotalTransactionFees } from "@/lib/utils/balance-validation";
import { getJitoTipAmountLamports } from "@/lib/utils/jito";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import { init as initHplCrons } from "@helium/hpl-crons-sdk";
import { init as initProxy, proxyAssignmentKey } from "@helium/nft-proxy-sdk";
import { init as initProposal } from "@helium/proposal-sdk";
import {
  customSignerKey,
  nextAvailableTaskIds,
  taskKey,
  taskQueueAuthorityKey,
  init as initTuktuk,
} from "@helium/tuktuk-sdk";
import {
  init as initVsr,
  positionKey,
  proxyVoteMarkerKey,
  voteMarkerKey,
} from "@helium/voter-stake-registry-sdk";
import { NATIVE_MINT } from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  TASK_QUEUE,
  validatePositionOwnership,
  buildBatchedTransactions,
} from "../helpers";
import type { InstructionGroup } from "../helpers";

export const relinquishVote = publicProcedure.governance.relinquishVote.handler(
  async ({ input, errors }) => {
    const { walletAddress, proposalKey, positionMints, choice } = input;

    const { connection, provider } = createSolanaConnection(walletAddress);
    const walletPubkey = new PublicKey(walletAddress);
    const proposalPubkey = new PublicKey(proposalKey);

    const vsrProgram = await initVsr(provider);
    const proposalProgram = await initProposal(provider);
    const proxyProgram = await initProxy(provider);

    const proposalAcc =
      await proposalProgram.account.proposalV0.fetchNullable(proposalPubkey);

    if (!proposalAcc) {
      throw errors.NOT_FOUND({ message: "Proposal not found" });
    }

    if (choice >= proposalAcc.choices.length) {
      throw errors.BAD_REQUEST({
        message: `Invalid choice ${choice}. Proposal has ${proposalAcc.choices.length} choices.`,
      });
    }

    const positionMintPubkeys = positionMints.map((m) => new PublicKey(m));
    const positionPubkeys = positionMintPubkeys.map((m) => positionKey(m)[0]);
    const markerKeys = positionMintPubkeys.map(
      (m) => voteMarkerKey(m, proposalPubkey)[0],
    );

    const [positionAccounts, markerAccounts] = await Promise.all([
      vsrProgram.account.positionV0.fetchMultiple(positionPubkeys),
      vsrProgram.account.voteMarkerV0.fetchMultiple(markerKeys),
    ]);

    const registrarCache = new Map<
      string,
      Awaited<ReturnType<typeof vsrProgram.account.registrar.fetch>>
    >();

    const groups: InstructionGroup[] = [];
    let hasProxies = false;

    for (let i = 0; i < positionMints.length; i++) {
      const positionAcc = positionAccounts[i];

      if (!positionAcc) {
        throw errors.NOT_FOUND({
          message: `Position ${positionMints[i]} not found`,
        });
      }

      const { isOwner } = await validatePositionOwnership(
        connection,
        positionMintPubkeys[i],
        walletPubkey,
      );

      if (!isOwner) {
        const registrarKey = positionAcc.registrar.toBase58();
        let registrar = registrarCache.get(registrarKey);
        if (!registrar) {
          registrar = await vsrProgram.account.registrar.fetch(
            positionAcc.registrar,
          );
          registrarCache.set(registrarKey, registrar);
        }
        const proxyAssignmentAddr = proxyAssignmentKey(
          registrar.proxyConfig,
          positionMintPubkeys[i],
          walletPubkey,
        )[0];
        const proxyAssignment =
          await proxyProgram.account.proxyAssignmentV0.fetchNullable(
            proxyAssignmentAddr,
          );

        if (!proxyAssignment) {
          throw errors.BAD_REQUEST({
            message: `Wallet does not own or have proxy for position ${positionMints[i]}`,
          });
        }
        hasProxies = true;
        continue;
      }

      const marker = markerAccounts[i];

      if (!marker || !marker.choices.includes(choice)) {
        continue;
      }

      groups.push({
        instructions: [
          await vsrProgram.methods
            .relinquishVoteV1({ choice })
            .accountsPartial({
              proposal: proposalPubkey,
              position: positionPubkeys[i],
              marker: markerKeys[i],
              voter: walletPubkey,
            })
            .instruction(),
        ],
        metadata: {
          type: "voting_relinquish",
          description: `Relinquish vote for choice ${choice}`,
        },
      });
    }

    if (hasProxies) {
      const proxyVoteMarkerK = proxyVoteMarkerKey(
        walletPubkey,
        proposalPubkey,
      )[0];
      const proxyMarkerAcc =
        await vsrProgram.account.proxyMarkerV0.fetchNullable(proxyVoteMarkerK);

      if (proxyMarkerAcc?.choices.includes(choice)) {
        const hplCronsProgram = await initHplCrons(provider);
        const tuktukProgram = await initTuktuk(provider);
        const taskQueueAcc =
          await tuktukProgram.account.taskQueueV0.fetch(TASK_QUEUE);

        const task1 = nextAvailableTaskIds(taskQueueAcc.taskBitmap, 1)[0];
        const queueAuthority = PublicKey.findProgramAddressSync(
          [Buffer.from("queue_authority")],
          hplCronsProgram.programId,
        )[0];

        groups.unshift({
          instructions: [
            await vsrProgram.methods
              .proxiedRelinquishVoteV1({ choice })
              .accountsPartial({
                proposal: proposalPubkey,
                voter: walletPubkey,
                marker: proxyVoteMarkerK,
              })
              .instruction(),
            await hplCronsProgram.methods
              .queueProxyVoteV0({ freeTaskId: task1 })
              .accountsPartial({
                marker: proxyVoteMarkerK,
                task: taskKey(TASK_QUEUE, task1)[0],
                taskQueue: TASK_QUEUE,
                payer: walletPubkey,
                systemProgram: SystemProgram.programId,
                queueAuthority,
                tuktukProgram: tuktukProgram.programId,
                voter: walletPubkey,
                pdaWallet: customSignerKey(TASK_QUEUE, [
                  Buffer.from("vote_payer"),
                  walletPubkey.toBuffer(),
                ])[0],
                taskQueueAuthority: taskQueueAuthorityKey(
                  TASK_QUEUE,
                  queueAuthority,
                )[0],
              })
              .instruction(),
          ],
          metadata: {
            type: "voting_relinquish_proxy",
            description: `Relinquish proxy vote for choice ${choice}`,
          },
        });
      }
    }

    if (groups.length === 0) {
      throw errors.BAD_REQUEST({
        message:
          "No votes to relinquish - positions have not voted for this choice",
      });
    }

    const { transactions, versionedTransactions, hasMore } =
      await buildBatchedTransactions({
        groups,
        connection,
        feePayer: walletPubkey,
      });

    const cluster = getCluster();
    const jitoTipCost =
      (cluster === "mainnet" || cluster === "mainnet-beta") &&
      versionedTransactions.length > 1
        ? getJitoTipAmountLamports()
        : 0;
    const totalFee =
      getTotalTransactionFees(versionedTransactions) + jitoTipCost;

    const walletBalance = await connection.getBalance(walletPubkey);
    if (walletBalance < totalFee) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance for transaction fees",
        data: { required: totalFee, available: walletBalance },
      });
    }

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.VOTING_RELINQUISH,
      walletAddress,
      proposalKey,
      choice,
      positionCount: positionMints.length,
    });

    return {
      transactionData: {
        transactions,
        parallel: true,
        tag,
        actionMetadata: {
          type: "voting_relinquish",
          proposalKey,
          choice,
          positionCount: positionMints.length,
        },
      },
      hasMore,
      estimatedSolFee: await toTokenAmountOutput(
        new BN(totalFee),
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);
