import { useSolanaUnixNow } from "@helium/helium-react-hooks";
import { init as hsdInit } from "@helium/helium-sub-daos-sdk";
import { useProposal } from "@helium/modular-governance-hooks";
import {
  init as hplCronsInit,
  TASK_QUEUE_ID,
} from "@helium/hpl-crons-sdk";
import { Status, batchParallelInstructions, truthy } from "@helium/spl-utils";
import {
  init,
  proxyVoteMarkerKey,
  voteMarkerKey,
} from "@helium/voter-stake-registry-sdk";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import { useCallback, useMemo } from "react";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { calcPositionVotingPower } from "../utils/calcPositionVotingPower";
import { customSignerKey, taskKey, taskQueueAuthorityKey,nextAvailableTaskIds,  init as tuktukInit } from "@helium/tuktuk-sdk";
import { useVoteMarkers } from "./useVoteMarkers";
import { useProposalEndTs } from "./useProposalEndTs";
import { useProxyVoteMarker } from "./useProxyVoteMarker";
import { useSortedPositions } from "./useSortedPositions";

export const useVote = (proposalKey: PublicKey) => {
  const { info: proposal } = useProposal(proposalKey);
  const { provider, registrar } = useHeliumVsrState();
  const unixNow = useSolanaUnixNow();
  const proxyVoteMarkerK = useMemo(() => {
    if (!provider?.wallet?.publicKey) return null;
    return proxyVoteMarkerKey(provider.wallet.publicKey, proposalKey)[0];
  }, [provider?.wallet?.publicKey, proposalKey]);
  const { info: proxyVoteMarker } = useProxyVoteMarker(proxyVoteMarkerK);
  const sortedPositions = useSortedPositions()
  const voteMarkerKeys = useMemo(() => {
    return sortedPositions
      ? sortedPositions.map((p) => voteMarkerKey(p.mint, proposalKey)[0])
      : [];
  }, [sortedPositions]);
  const { accounts: markers } = useVoteMarkers(voteMarkerKeys);
  const voteWeights: BN[] | undefined = useMemo(() => {
    if (proposal && markers) {
      return markers.reduce((acc, marker, idx) => {
        const position = sortedPositions?.[idx];
        marker.info?.choices.forEach((choice) => {
          // Only count my own and down the line vote weights
          if (
            (marker?.info?.proxyIndex || 0) >= (position?.proxy?.index || 0)
          ) {
            acc[choice] = (acc[choice] || new BN(0)).add(
              marker.info?.weight || new BN(0)
            );
          }
        });
        return acc;
      }, new Array(proposal?.choices.length));
    }
  }, [proposal, markers, sortedPositions]);
  const didVote: boolean[] | undefined = useMemo(() => {
    if (proposal && markers) {
      const rawVoteWeights = markers.reduce((acc, marker, idx) => {
        const position = sortedPositions?.[idx];
        marker.info?.choices.forEach((choice) => {
          // Only count my own and down the line vote weights
          if (
            (marker?.info?.proxyIndex || 0) >= (position?.proxy?.index || 0)
          ) {
            acc[choice] = (acc[choice] || marker.info && !marker.info.weight.isZero())
          }
        });
        return acc;
      }, new Array(proposal?.choices.length));

      for (const choice of proxyVoteMarker?.choices || []) {
        rawVoteWeights[choice] = true;
      }

      return rawVoteWeights;
    }
  }, [proposal, markers, sortedPositions, proxyVoteMarker]);
  const voters: PublicKey[][] | undefined = useMemo(() => {
    if (proposal && markers) {
      const nonUniqueResult = markers.reduce((acc, marker, idx) => {
        const position = sortedPositions?.[idx];
        marker.info?.choices.forEach((choice) => {
          acc[choice] ||= [];
          if (
            marker.info?.voter &&
            marker.info.proxyIndex > (position?.proxy?.index || 0)
          ) {
            acc[choice].push(marker.info.voter);
          }

          return acc;
        });
        return acc;
      }, new Array(proposal?.choices.length));
      return nonUniqueResult.map((voters) =>
        Array.from(new Set(voters.map((v) => v.toBase58()))).map(
          (v: any) => new PublicKey(v)
        )
      );
    }
  }, [markers, sortedPositions]);

  const endTs = useProposalEndTs(proposalKey);
  const canPositionVote = useCallback(
    (index: number, choice: number) => {
      const position = sortedPositions?.[index];
      const marker = markers?.[index];

      const earlierDelegateVoted =
        position &&
        position.proxy &&
        marker?.info &&
        position.proxy.index > marker.info.proxyIndex;
      const noMarker = !marker?.info;
      const maxChoicesReached =
        (marker?.info?.choices.length || 0) >=
        (proposal?.maxChoicesPerVoter || 0);
      const alreadyVotedThisChoice = marker?.info?.choices.includes(choice);
      const now = unixNow && new BN(unixNow);
      const proxyExpired =
        position?.proxy?.expirationTime &&
        now &&
        new BN(position.proxy.expirationTime).lt(now);
      const votingPowerIsZero =
        now &&
        calcPositionVotingPower({
          position,
          registrar: registrar || null,
          unixNow: now,
        }).isZero();
      const canVote =
        !proxyExpired &&
        !votingPowerIsZero &&
        (noMarker ||
          (!maxChoicesReached &&
            !alreadyVotedThisChoice &&
            !earlierDelegateVoted));
      return canVote;
    },
    [registrar, unixNow, markers, sortedPositions]
  );
  const canVote = useCallback(
    (choice: number) => {
      if (!markers || !proposal) return false;
      const myPositions = sortedPositions.filter((p) => !p.isProxiedToMe);
      const myPositionsCanVote = myPositions.some((p) => canPositionVote(p.index, choice));
      const hasProxies = sortedPositions.some((p) => p.isProxiedToMe);
      const hasNeverProxyVoted = hasProxies && !proxyVoteMarker;
      const hasProxyVotedButCanVote = proxyVoteMarker && proxyVoteMarker.choices.length < proposal.maxChoicesPerVoter && !proxyVoteMarker.choices.includes(choice);
      return myPositionsCanVote || hasNeverProxyVoted || hasProxyVotedButCanVote;
    },
    [markers, canPositionVote, proxyVoteMarker]
  );
  const { error, loading, execute } = useAsyncCallback(
    async ({
      choice,
      onInstructions,
      onProgress,
      maxSignatureBatch,
    }: {
      choice: number; // Instead of sending the transaction, let the caller decide
      onInstructions?: (
        instructions: TransactionInstruction[][]
      ) => Promise<void>;
      onProgress?: (status: Status) => void;
      maxSignatureBatch?: number;
    }) => {
      const isInvalid =
        !provider || !sortedPositions || sortedPositions.length === 0;

      if (isInvalid) {
        throw new Error(
          "Unable to vote without positions. Please stake tokens first."
        );
      } else {
        const vsrProgram = await init(provider);
        const hsdProgram = await hsdInit(provider);
        const hplCronsProgram = await hplCronsInit(provider);
        const tuktukProgram = await tuktukInit(provider);
        const taskQueue = await tuktukProgram.account.taskQueueV0.fetch(
          TASK_QUEUE_ID
        );
        const hasProxies = sortedPositions.some((p) => p.isProxiedToMe);
        const votingPositions = sortedPositions.filter(
          (p) => !p.isProxiedToMe && canPositionVote(p.index, choice)
        );
        const nextAvailable = nextAvailableTaskIds(
          taskQueue.taskBitmap,
          (hasProxies ? 2 : 0) + votingPositions.length
        );

        const proxyVoteInstructions: TransactionInstruction[] = [];
        if (hasProxies) {
          const proxyVoteMarker = proxyVoteMarkerKey(
            provider.wallet.publicKey,
            proposalKey
          )[0];
          const proxyVoteMarkerInfo =
            await vsrProgram.account.proxyMarkerV0.fetchNullable(
              proxyVoteMarker
            );
          if (!proxyVoteMarkerInfo?.choices.includes(choice)) {
            proxyVoteInstructions.push(
              await vsrProgram.methods
                .proxiedVoteV1({
                  choice,
                })
                .accountsPartial({
                  proposal: proposalKey,
                  voter: provider.wallet.publicKey,
                  marker: proxyVoteMarker,
                })
                .instruction()
            );
            const task1 = nextAvailable.pop()!;
            const task2 = nextAvailable.pop()!;
            const taskQueue = TASK_QUEUE_ID;
            const queueAuthority = PublicKey.findProgramAddressSync(
              [Buffer.from("queue_authority")],
              hplCronsProgram.programId
            )[0];
            proxyVoteInstructions.push(
              await hplCronsProgram.methods
              // @ts-ignore
                .queueProxyVoteV0({
                  freeTaskId: task1,
                })
                .accountsPartial({
                  marker: proxyVoteMarker,
                  task: taskKey(taskQueue, task1)[0],
                  taskQueue,
                  payer: provider.wallet.publicKey,
                  systemProgram: SystemProgram.programId,
                  queueAuthority,
                  tuktukProgram: tuktukProgram.programId,
                  voter: provider.wallet.publicKey,
                  pdaWallet: customSignerKey(taskQueue, [
                    Buffer.from("vote_payer"),
                    provider.wallet.publicKey.toBuffer(),
                  ])[0],
                  taskQueueAuthority: taskQueueAuthorityKey(
                    taskQueue,
                    queueAuthority
                  )[0],
                })
                .instruction()
            );
            // First time voting? Queue the relinquish
            if (!proxyVoteMarkerInfo) {
              proxyVoteInstructions.push(
                await hplCronsProgram.methods
                  // @ts-ignore
                  .queueRelinquishExpiredProxyVoteMarkerV0({
                    freeTaskId: task2,
                    triggerTs: endTs!,
                  })
                  .accountsPartial({
                    marker: proxyVoteMarker,
                    task: taskKey(taskQueue, task2)[0],
                    taskQueue,
                    payer: provider.wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                    queueAuthority,
                    tuktukProgram: tuktukProgram.programId,
                    taskQueueAuthority: taskQueueAuthorityKey(
                      taskQueue,
                      queueAuthority
                    )[0],
                  })
                  .instruction()
              );
            }
          }
        }

        const normalVoteInstructions = (
          await Promise.all(
            // vote with bigger positions first.
            votingPositions.map(async (position) => {
              const markerK = voteMarkerKey(position.mint, proposalKey)[0];

              const instructions: TransactionInstruction[] = [];
              instructions.push(
                await vsrProgram.methods
                  .voteV0({
                    choice,
                  })
                  .accountsPartial({
                    proposal: proposalKey,
                    voter: provider.wallet.publicKey,
                    position: position.pubkey,
                    marker: voteMarkerKey(position.mint, proposalKey)[0],
                  })
                  .instruction()
              );

              if (position.isDelegated) {
                instructions.push(
                  await hsdProgram.methods
                    .trackVoteV0()
                    .accountsPartial({
                      proposal: proposalKey,
                      marker: markerK,
                      position: position.pubkey,
                    })
                    .instruction()
                );
              }

              const marker = markers?.[position.index];

              // First time voting? Queue the relinquish
              if (!marker?.account) {
                let freeTaskId = nextAvailable.pop();
                instructions.push(
                  await hplCronsProgram.methods
                    .queueRelinquishExpiredVoteMarkerV0({
                      freeTaskId: freeTaskId!,
                      triggerTs: endTs!,
                    })
                    .accountsPartial({
                      marker: markerK,
                      position: position.pubkey,
                      task: taskKey(TASK_QUEUE_ID, freeTaskId!)[0],
                      taskQueue: TASK_QUEUE_ID,
                    })
                    .instruction()
                );
              }

              return instructions;
            })
          )
        )
          .filter(truthy)

        if (onInstructions) {
          await onInstructions([
            proxyVoteInstructions,
            ...normalVoteInstructions,
          ]);
        } else {
          await batchParallelInstructions({
            provider,
            instructions: [proxyVoteInstructions, ...normalVoteInstructions],
            onProgress,
            triesRemaining: 10,
            extraSigners: [],
            maxSignatureBatch,
          });
        }
      }
    }
  );

  return {
    error,
    loading,
    vote: execute,
    markers,
    voteWeights,
    canVote,
    voters,
    didVote,
  };
};
