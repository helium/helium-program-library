import {
  batchParallelInstructions,
  bulkSendTransactions,
  chunks,
  truthy,
} from "@helium/spl-utils";
import { init, voteMarkerKey } from "@helium/voter-stake-registry-sdk";
import { PublicKey } from "@metaplex-foundation/js";
import { Transaction } from "@solana/web3.js";
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

      return markers.some((m, index) => {
        const position = positions?.[index];
        const earlierDelegateVoted =
          position &&
          position.votingDelegation &&
          m.info &&
          position.votingDelegation.index > m.info.delegationIndex;
        return !earlierDelegateVoted && m.info?.choices.includes(choice);
      });
    },
    [markers]
  );

  const { error, loading, execute } = useAsyncCallback(
    async ({ choice }: { choice: number }) => {
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
                if (position.isVotingDelegatedToMe) {
                  if (
                    marker.delegationIndex <
                    (position.votingDelegation?.index || 0)
                  ) {
                    // Do not vote with a position that has been delegated to us, but voting overidden
                    return;
                  }

                  return await vsrProgram.methods
                    .delegatedRelinquishVoteV0({
                      choice,
                    })
                    .accounts({
                      proposal,
                      owner: provider.wallet.publicKey,
                      position: position.pubkey,
                    })
                    .instruction();
                }
                return await vsrProgram.methods
                  .relinquishVoteV1({
                    choice,
                  })
                  .accounts({
                    proposal,
                    voter: provider.wallet.publicKey,
                    position: position.pubkey,
                  })
                  .instruction();
              }
            })
          )
        ).filter(truthy);

        await batchParallelInstructions(provider, instructions);
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
