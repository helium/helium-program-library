import { Status, batchParallelInstructions, truthy } from "@helium/spl-utils";
import { init, voteMarkerKey } from "@helium/voter-stake-registry-sdk";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useCallback, useMemo } from "react";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { useVoteMarkers } from "./useVoteMarkers";
import { MAX_TRANSACTIONS_PER_SIGNATURE_BATCH } from "../constants";
import { useSolanaUnixNow } from "@helium/helium-react-hooks";
import { calcPositionVotingPower } from "../utils/calcPositionVotingPower";
import BN from "bn.js";
import { proxyAssignmentKey } from "@helium/nft-proxy-sdk";
import { init as initHsd } from "@helium/helium-sub-daos-sdk";

export const useRelinquishVote = (proposal: PublicKey) => {
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
      ? sortedPositions.map((p) => voteMarkerKey(p.mint, proposal)[0])
      : [];
  }, [sortedPositions]);
  const { accounts: markers } = useVoteMarkers(voteMarkerKeys);
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
      );
    },
    [markers, canPositionRelinquishVote]
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

        const instructions = (
          await Promise.all(
            sortedPositions.map(async (position, index) => {
              const canRelinquishVote = canPositionRelinquishVote(
                index,
                choice
              );
              const marker = markers?.[index]?.info;
              const markerK = voteMarkerKey(position.mint, proposal)[0];

              const instructions: TransactionInstruction[] = [];
              if (marker && canRelinquishVote) {
                if (position.isProxiedToMe) {
                  if (marker.proxyIndex < (position.proxy?.index || 0)) {
                    // Do not vote with a position that has been delegated to us, but voting overidden
                    return;
                  }

                  instructions.push(
                    await vsrProgram.methods
                      .proxiedRelinquishVoteV0({
                        choice,
                      })
                      .accountsPartial({
                        proposal,
                        voter: provider.wallet.publicKey,
                        position: position.pubkey,
                        marker: markerK,
                        proxyAssignment: proxyAssignmentKey(
                          registrar!.proxyConfig,
                          position.mint,
                          provider.wallet.publicKey
                        )[0],
                      })
                      .instruction()
                  );
                }
                instructions.push(
                  await vsrProgram.methods
                    .relinquishVoteV1({
                      choice,
                    })
                    .accountsPartial({
                      proposal,
                      position: position.pubkey,
                      marker: markerK,
                      voter: provider.wallet.publicKey,
                    })
                    .instruction()
                );
              }

              if (position.isDelegated) {
                instructions.push(
                  await hsdProgram.methods
                    .trackVoteV0()
                    .accountsPartial({
                      proposal,
                      marker: markerK,
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
    relinquishVote: execute,
    canRelinquishVote,
  };
};
