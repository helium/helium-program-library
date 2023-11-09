import { bulkSendTransactions, chunks, truthy } from "@helium/spl-utils";
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

      return markers.some((m) => m.info?.choices.includes(choice));
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

        const txs = chunks(instructions, 4).map((ixs) => {
          const tx = new Transaction({
            feePayer: provider.wallet.publicKey,
          });
          tx.add(...ixs);

          return tx;
        });

        await bulkSendTransactions(provider, txs);
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
