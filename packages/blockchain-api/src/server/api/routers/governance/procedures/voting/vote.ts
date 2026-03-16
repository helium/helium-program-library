import { publicProcedure } from "@/server/api/procedures";
import { createSolanaConnection } from "@/lib/solana";
import { getTotalTransactionFees } from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import { init as initHplCrons } from "@helium/hpl-crons-sdk";
import { init as initProxy, proxyAssignmentKey } from "@helium/nft-proxy-sdk";
import { init as initProposal } from "@helium/proposal-sdk";
import { init as initStateController } from "@helium/state-controller-sdk";
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
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import {
  TASK_QUEUE,
  validatePositionOwnership,
  buildBatchedTransactions,
} from "../helpers";
import type { InstructionGroup } from "../helpers";

export const vote = publicProcedure.governance.vote.handler(
  async ({ input, errors }) => {
    const { walletAddress, proposalKey, positionMints, choice } = input;

    const { connection, provider } = createSolanaConnection(walletAddress);
    const walletPubkey = new PublicKey(walletAddress);
    const proposalPubkey = new PublicKey(proposalKey);

    const vsrProgram = await initVsr(provider);
    const proposalProgram = await initProposal(provider);
    const stateControllerProgram = await initStateController(provider);
    const hplCronsProgram = await initHplCrons(provider);
    const tuktukProgram = await initTuktuk(provider);
    const proxyProgram = await initProxy(provider);

    const proposalAcc =
      await proposalProgram.account.proposalV0.fetchNullable(proposalPubkey);

    if (!proposalAcc) {
      throw errors.NOT_FOUND({ message: "Proposal not found" });
    }

    if (!proposalAcc.state.voting) {
      throw errors.BAD_REQUEST({ message: "Proposal is not in voting state" });
    }

    if (choice >= proposalAcc.choices.length) {
      throw errors.BAD_REQUEST({
        message: `Invalid choice ${choice}. Proposal has ${proposalAcc.choices.length} choices.`,
      });
    }

    const proposalConfigAcc =
      await proposalProgram.account.proposalConfigV0.fetch(
        proposalAcc.proposalConfig,
      );
    const resolutionSettings =
      await stateControllerProgram.account.resolutionSettingsV0.fetchNullable(
        proposalConfigAcc.stateController,
      );

    let endTs: BN;
    if (proposalAcc.state.resolved) {
      endTs = new BN(proposalAcc.state.resolved.endTs);
    } else if (proposalAcc.state.voting && resolutionSettings) {
      const startTs = new BN(proposalAcc.state.voting.startTs);
      const offsetNode = resolutionSettings.settings.nodes.find(
        (node: { offsetFromStartTs?: { offset: BN } }) =>
          typeof node.offsetFromStartTs !== "undefined",
      );
      const offset = offsetNode?.offsetFromStartTs?.offset ?? new BN(0);
      endTs = startTs.add(offset);
    } else {
      throw errors.BAD_REQUEST({
        message: "Unable to determine voting end time",
      });
    }
    const taskQueueAcc =
      await tuktukProgram.account.taskQueueV0.fetch(TASK_QUEUE);

    type VoteMarkerV0 = Awaited<
      ReturnType<typeof vsrProgram.account.voteMarkerV0.fetchNullable>
    >;

    interface PositionVoteData {
      positionMint: string;
      positionMintPubkey: PublicKey;
      positionPubkey: PublicKey;
      markerKey: PublicKey;
      existingMarker: VoteMarkerV0;
      needsTask: boolean;
      isProxied: boolean;
    }

    const ownedPositionsToVote: PositionVoteData[] = [];
    const proxiedPositionsToVote: PositionVoteData[] = [];
    let ownedTaskIdsNeeded = 0;
    let hasProxies = false;

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

    for (let i = 0; i < positionMints.length; i++) {
      const positionMint = positionMints[i];
      const positionMintPubkey = positionMintPubkeys[i];
      const positionPubkey = positionPubkeys[i];
      const positionAcc = positionAccounts[i];

      if (!positionAcc) {
        throw errors.NOT_FOUND({
          message: `Position ${positionMint} not found`,
        });
      }

      const { isOwner } = await validatePositionOwnership(
        connection,
        positionMintPubkey,
        walletPubkey,
      );

      let isProxied = false;
      if (!isOwner) {
        const registrarKey = positionAcc.registrar.toBase58();
        let registrar = registrarCache.get(registrarKey);
        if (!registrar) {
          registrar = await vsrProgram.account.registrar.fetch(
            positionAcc.registrar,
          );
          registrarCache.set(registrarKey, registrar);
        }
        const proxyConfig = registrar.proxyConfig;
        const proxyAssignmentAddr = proxyAssignmentKey(
          proxyConfig,
          positionMintPubkey,
          walletPubkey,
        )[0];
        const proxyAssignment =
          await proxyProgram.account.proxyAssignmentV0.fetchNullable(
            proxyAssignmentAddr,
          );

        if (!proxyAssignment) {
          throw errors.BAD_REQUEST({
            message: `Wallet does not own or have proxy for position ${positionMint}`,
          });
        }
        isProxied = true;
        hasProxies = true;
      }

      const existingMarker = markerAccounts[i];

      if (existingMarker?.choices.includes(choice)) {
        continue;
      }

      if (
        existingMarker &&
        existingMarker.choices.length >= proposalAcc.maxChoicesPerVoter
      ) {
        continue;
      }

      const needsTask = !existingMarker && !isProxied;
      if (needsTask) {
        ownedTaskIdsNeeded += 1;
      }

      const data: PositionVoteData = {
        positionMint,
        positionMintPubkey,
        positionPubkey,
        markerKey: markerKeys[i],
        existingMarker,
        needsTask,
        isProxied,
      };

      if (isProxied) {
        proxiedPositionsToVote.push(data);
      } else {
        ownedPositionsToVote.push(data);
      }
    }

    const totalTaskIds = (hasProxies ? 2 : 0) + ownedTaskIdsNeeded;
    const nextAvailable = nextAvailableTaskIds(
      taskQueueAcc.taskBitmap,
      totalTaskIds,
    );

    const allInstructions: TransactionInstruction[][] = [];

    if (hasProxies) {
      const proxyVoteMarkerK = proxyVoteMarkerKey(
        walletPubkey,
        proposalPubkey,
      )[0];
      const proxyMarkerAcc =
        await vsrProgram.account.proxyMarkerV0.fetchNullable(proxyVoteMarkerK);

      if (!proxyMarkerAcc?.choices.includes(choice)) {
        const proxyInstructions: TransactionInstruction[] = [];

        proxyInstructions.push(
          await vsrProgram.methods
            .proxiedVoteV1({ choice })
            .accountsPartial({
              proposal: proposalPubkey,
              voter: walletPubkey,
              marker: proxyVoteMarkerK,
            })
            .instruction(),
        );

        const task1 = nextAvailable.pop()!;
        const task2 = nextAvailable.pop()!;
        const queueAuthority = PublicKey.findProgramAddressSync(
          [Buffer.from("queue_authority")],
          hplCronsProgram.programId,
        )[0];

        proxyInstructions.push(
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
        );

        if (!proxyMarkerAcc) {
          proxyInstructions.push(
            await hplCronsProgram.methods
              .queueRelinquishExpiredProxyVoteMarkerV0({
                freeTaskId: task2,
                triggerTs: endTs,
              })
              .accountsPartial({
                marker: proxyVoteMarkerK,
                task: taskKey(TASK_QUEUE, task2)[0],
                taskQueue: TASK_QUEUE,
                payer: walletPubkey,
                systemProgram: SystemProgram.programId,
                queueAuthority,
                tuktukProgram: tuktukProgram.programId,
                taskQueueAuthority: taskQueueAuthorityKey(
                  TASK_QUEUE,
                  queueAuthority,
                )[0],
              })
              .instruction(),
          );
        }

        allInstructions.push(proxyInstructions);
      }
    }

    for (const data of ownedPositionsToVote) {
      const instructions: TransactionInstruction[] = [];

      instructions.push(
        await vsrProgram.methods
          .voteV0({ choice })
          .accountsPartial({
            proposal: proposalPubkey,
            voter: walletPubkey,
            position: data.positionPubkey,
            marker: data.markerKey,
          })
          .instruction(),
      );

      if (data.needsTask) {
        if (nextAvailable.length === 0) {
          throw errors.BAD_REQUEST({ message: "No available task IDs" });
        }
        const freeTaskId = nextAvailable.pop()!;
        instructions.push(
          await hplCronsProgram.methods
            .queueRelinquishExpiredVoteMarkerV0({
              freeTaskId,
              triggerTs: endTs,
            })
            .accountsPartial({
              marker: data.markerKey,
              position: data.positionPubkey,
              task: taskKey(TASK_QUEUE, freeTaskId)[0],
              taskQueue: TASK_QUEUE,
            })
            .instruction(),
        );
      }

      allInstructions.push(instructions);
    }

    if (allInstructions.length === 0) {
      throw errors.BAD_REQUEST({
        message:
          "No votes to cast - all positions already voted for this choice",
      });
    }

    const groups: InstructionGroup[] = allInstructions.map((instructions) => ({
      instructions,
      metadata: {
        type: "voting_vote",
        description: `Vote on proposal choice ${choice}`,
      },
    }));

    const { transactions, versionedTransactions, hasMore } =
      await buildBatchedTransactions({
        groups,
        connection,
        feePayer: walletPubkey,
      });

    const totalFee = getTotalTransactionFees(versionedTransactions);

    const walletBalance = await connection.getBalance(walletPubkey);
    if (walletBalance < totalFee) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance for transaction fees",
        data: { required: totalFee, available: walletBalance },
      });
    }

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.VOTING_VOTE,
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
      },
      hasMore,
      estimatedSolFee: toTokenAmountOutput(
        new BN(totalFee),
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);
