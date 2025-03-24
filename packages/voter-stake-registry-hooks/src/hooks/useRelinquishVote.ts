import { init as initHsd } from "@helium/helium-sub-daos-sdk";
import { init as hplCronsInit, TASK_QUEUE_ID } from "@helium/hpl-crons-sdk";
import { batchParallelInstructions, Status, truthy } from "@helium/spl-utils";
import {
  customSignerKey,
  nextAvailableTaskIds,
  taskKey,
  taskQueueAuthorityKey,
  init as tuktukInit,
} from "@helium/tuktuk-sdk";
import { init, proxyVoteMarkerKey, voteMarkerKey } from "@helium/voter-stake-registry-sdk";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { useCallback, useMemo } from "react";
import { useAsyncCallback } from "react-async-hook";
import { MAX_TRANSACTIONS_PER_SIGNATURE_BATCH } from "../constants";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { useProxyVoteMarker } from "./useProxyVoteMarker";
import { useSortedPositions } from "./useSortedPositions";
import { useVoteMarkers } from "./useVoteMarkers";

export const useRelinquishVote = (proposal: PublicKey) => {
  const { provider } = useHeliumVsrState();
  const sortedPositions = useSortedPositions();
  const voteMarkerKeys = useMemo(() => {
    return sortedPositions
      ? sortedPositions.map((p) => voteMarkerKey(p.mint, proposal)[0])
      : [];
  }, [sortedPositions]);
  const { accounts: markers } = useVoteMarkers(voteMarkerKeys);
  const proxyVoteMarkerK = useMemo(() => {
    if (!provider?.wallet?.publicKey) return null;
    return proxyVoteMarkerKey(provider.wallet.publicKey, proposal)[0];
  }, [provider?.wallet?.publicKey, proposal]);
  const { info: proxyVoteMarker } = useProxyVoteMarker(proxyVoteMarkerK);
  const canPositionRelinquishVote = useCallback(
    (index: number, choice: number) => {
      const position = sortedPositions?.[index];
      const marker = markers?.[index]?.info;
      const earlierDelegateVoted =
        position &&
        position.proxy &&
        marker &&
        position.proxy.index > marker.proxyIndex;
      return !earlierDelegateVoted && marker?.choices.includes(choice);
    },
    [markers]
  );
  const canRelinquishVote = useCallback(
    (choice: number) => {
      if (!markers) return false;

      return markers.some((_, index) =>
        canPositionRelinquishVote(index, choice)
      ) || (proxyVoteMarker && proxyVoteMarker.choices.includes(choice));
    },
    [markers, canPositionRelinquishVote, proxyVoteMarker]
  );

  const { error, loading, execute } = useAsyncCallback(
    async ({
      choice,
      onInstructions,
      onProgress,
      maxSignatureBatch = MAX_TRANSACTIONS_PER_SIGNATURE_BATCH,
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
        const hsdProgram = await initHsd(provider);
        
        const proxyVoteInstructions: TransactionInstruction[] = [];
        if (sortedPositions.some((p) => p.isProxiedToMe)) {
          const proxyVoteMarker = proxyVoteMarkerKey(
            provider.wallet.publicKey,
            proposal
          )[0];
          const proxyVoteMarkerInfo =
            await vsrProgram.account.proxyMarkerV0.fetchNullable(
              proxyVoteMarker
            );
          if (proxyVoteMarkerInfo?.choices.includes(choice)) {
            const hplCronsProgram = await hplCronsInit(provider);
            const tuktukProgram = await tuktukInit(provider);
            const taskQueue = await tuktukProgram.account.taskQueueV0.fetch(
              TASK_QUEUE_ID
            );
            const task1 = nextAvailableTaskIds(
              taskQueue.taskBitmap,
              1
            )[0];
            const queueAuthority = PublicKey.findProgramAddressSync(
              [Buffer.from("queue_authority")],
              hplCronsProgram.programId
            )[0];

            proxyVoteInstructions.push(
              await vsrProgram.methods
                .proxiedRelinquishVoteV1({
                  choice,
                })
                .accounts({
                  proposal,
                  voter: provider.wallet.publicKey,
                  marker: proxyVoteMarker,
                })
                .instruction(),
              await hplCronsProgram.methods
                // @ts-ignore
                .queueProxyVoteV0({
                  freeTaskId: task1,
                })
                .accounts({
                  marker: proxyVoteMarker,
                  task: taskKey(TASK_QUEUE_ID, task1)[0],
                  taskQueue: TASK_QUEUE_ID,
                  payer: provider.wallet.publicKey,
                  systemProgram: SystemProgram.programId,
                  queueAuthority,
                  tuktukProgram: tuktukProgram.programId,
                  voter: provider.wallet.publicKey,
                  pdaWallet: customSignerKey(TASK_QUEUE_ID, [
                    Buffer.from("vote_payer"),
                    provider.wallet.publicKey.toBuffer(),
                  ])[0],
                  taskQueueAuthority: taskQueueAuthorityKey(
                    TASK_QUEUE_ID,
                    queueAuthority
                  )[0],
                })
                .instruction()
            );
          }
        }

        const normalVoteInstructions = (
          await Promise.all(
            sortedPositions.map(async (position, index) => {
              const canRelinquishVote = canPositionRelinquishVote(
                index,
                choice
              );
              const marker = markers?.[index]?.info;
              const markerK = voteMarkerKey(position.mint, proposal)[0];
              const instructions: TransactionInstruction[] = [];

              if (marker && canRelinquishVote && !position.isProxiedToMe) {
                instructions.push(
                  await vsrProgram.methods
                    .relinquishVoteV1({
                      choice,
                    })
                    .accounts({
                      proposal,
                      voter: provider.wallet.publicKey,
                      position: position.pubkey,
                    })
                    .instruction()
                );
              }

              return instructions;
            })
          )
        )
          .filter(truthy)
          .flat();

        if (onInstructions) {
          await onInstructions([
            ...proxyVoteInstructions,
            ...normalVoteInstructions,
          ]);
        } else {
          await batchParallelInstructions({
            provider,
            instructions: [
              ...proxyVoteInstructions,
              ...normalVoteInstructions,
            ],
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
    relinquishVote: execute,
    canRelinquishVote,
  };
};
