import { useSolanaUnixNow } from "@helium/helium-react-hooks";
import { init as hsdInit } from "@helium/helium-sub-daos-sdk";
import { useProposal } from "@helium/modular-governance-hooks";
import { proxyAssignmentKey } from "@helium/nft-proxy-sdk";
import {
  init as hplCronsInit,
  nextAvailableTaskIds,
  TASK_QUEUE_ID,
} from "@helium/hpl-crons-sdk";
import { Status, batchParallelInstructions, truthy } from "@helium/spl-utils";
import { init, voteMarkerKey } from "@helium/voter-stake-registry-sdk";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import { useCallback, useMemo } from "react";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { calcPositionVotingPower } from "../utils/calcPositionVotingPower";
import { init as initTuktuk, taskKey } from "@helium/tuktuk-sdk";
import { useVoteMarkers } from "./useVoteMarkers";
import { useProposalEndTs } from "./useProposalEndTs";

export const useVote = (proposalKey: PublicKey) => {
  const { info: proposal } = useProposal(proposalKey);
  const endTs = useProposalEndTs(proposalKey);
  const { positions, provider, registrar } = useHeliumVsrState();
  const unixNow = useSolanaUnixNow();
  const sortedPositions = useMemo(() => {
    return (
      unixNow &&
      positions?.sort((a, b) => {
        return -calcPositionVotingPower({
          position: a,
          registrar: registrar || null,
          unixNow: new BN(unixNow),
        }).cmp(
          calcPositionVotingPower({
            position: b,
            registrar: registrar || null,
            unixNow: new BN(unixNow),
          })
        );
      })
    );
  }, [positions, unixNow]);
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
      if (!markers) return false;
      return markers.some((_, index) => canPositionVote(index, choice));
    },
    [markers, canPositionVote]
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
        instructions: TransactionInstruction[]
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
        const tuktukProgram = await initTuktuk(provider);
        const freeTaskIds = nextAvailableTaskIds(
          (await tuktukProgram.account.taskQueueV0.fetch(TASK_QUEUE_ID))
            .taskBitmap,
          sortedPositions.length
        );

        const instructions = (
          await Promise.all(
            // vote with bigger positions first.
            sortedPositions.map(async (position, index) => {
              const marker = markers?.[index]?.info;
              const markerK = voteMarkerKey(position.mint, proposalKey)[0];

              const canVote = canPositionVote(index, choice);
              const instructions: TransactionInstruction[] = [];
              if (canVote) {
                if (position.isProxiedToMe) {
                  if (
                    marker &&
                    (marker.proxyIndex < (position.proxy?.index || 0) ||
                      marker.choices.includes(choice))
                  ) {
                    // Do not vote with a position that has been delegated to us, but voting overidden
                    // Also ignore voting for the same choice twice
                    return;
                  }

                  instructions.push(
                    await vsrProgram.methods
                      .proxiedVoteV0({
                        choice,
                      })
                      .accountsPartial({
                        proposal: proposalKey,
                        voter: provider.wallet.publicKey,
                        position: position.pubkey,
                        registrar: registrar?.pubkey,
                        marker: voteMarkerKey(position.mint, proposalKey)[0],
                        proxyAssignment: proxyAssignmentKey(
                          registrar!.proxyConfig,
                          position.mint,
                          provider.wallet.publicKey
                        )[0],
                      })
                      .instruction()
                  );
                } else {
                  instructions.push(
                    await vsrProgram.methods
                      .voteV0({
                        choice,
                      })
                      .accountsPartial({
                        proposal: proposalKey,
                        voter: provider.wallet.publicKey,
                        position: position.pubkey,
                        marker: markerK,
                      })
                      .instruction()
                  );
                }

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

                if (endTs) {
                  const freeTaskId = freeTaskIds.pop()!;
                  instructions.push(
                    await hplCronsProgram.methods
                      .queueRelinquishExpiredVoteMarkerV0({
                        freeTaskId,
                        triggerTs: endTs.add(new BN(1)),
                      })
                      .accounts({
                        marker: markerK,
                        taskQueue: TASK_QUEUE_ID,
                        position: position.pubkey,
                        task: taskKey(TASK_QUEUE_ID, freeTaskId)[0],
                      })
                      .instruction()
                  );
                }
              }

              return instructions;
            })
          )
        )
          .filter(truthy)
          .flat();

        if (onInstructions) {
          await onInstructions(instructions);
        } else {
          await batchParallelInstructions({
            provider,
            instructions,
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
  };
};
