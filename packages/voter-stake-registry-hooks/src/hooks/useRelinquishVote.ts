import {
  batchParallelInstructions,
  truthy
} from "@helium/spl-utils";
import { init, voteMarkerKey } from "@helium/voter-stake-registry-sdk";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useCallback, useMemo } from "react";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { useVoteMarkers } from "./useVoteMarkers";

export const useRelinquishVote = (proposal: PublicKey) => {
  const { positions, provider } = useHeliumVsrState();
  const voteMarkerKeys = useMemo(() => {
    return positions
      ? positions.map((p) => voteMarkerKey(p.mint, proposal)[0])
      : [];
  }, [positions]);
  const { accounts: markers } = useVoteMarkers(voteMarkerKeys);
  const canRelinquishVote = useCallback(
    (choice: number) => {
      if (!markers) return false;

      return markers.some((m) => m.info?.choices.includes(choice));
    },
    [markers]
  );

  const { error, loading, execute } = useAsyncCallback(
    async ({
      choice,
      onInstructions,
    }: {
      choice: number; // Instead of sending the transaction, let the caller decide
      onInstructions?: (
        instructions: TransactionInstruction[]
      ) => Promise<void>;
    }) => {
      const isInvalid = !provider || !positions || positions.length === 0;

      if (isInvalid) {
        throw new Error(
          "Unable to vote without positions. Please stake tokens first."
        );
      } else {
        const vsrProgram = await init(provider);
        const instructions = (
          await Promise.all(
            positions.map(async (position, index) => {
              const marker = markers?.[index]?.info;
              const alreadyVotedThisChoice = marker?.choices.includes(choice);

              if (marker && alreadyVotedThisChoice) {
                return await vsrProgram.methods
                  .relinquishVoteV1({
                    choice,
                  })
                  .accounts({
                    proposal,
                    voter: provider.wallet.publicKey,
                    position: position.pubkey,
                    refund: provider.wallet.publicKey,
                  })
                  .instruction();
              }
            })
          )
        ).filter(truthy);

        if (onInstructions) {
          await onInstructions(instructions);
        } else {
          await batchParallelInstructions(provider, instructions);
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
