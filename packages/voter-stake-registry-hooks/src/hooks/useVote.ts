import { useProposal } from "@helium/modular-governance-hooks";
import { bulkSendTransactions, chunks, truthy } from "@helium/spl-utils";
import { init, voteMarkerKey } from "@helium/voter-stake-registry-sdk";
import { PublicKey } from "@metaplex-foundation/js";
import { Transaction } from "@solana/web3.js";
import BN from "bn.js";
import { useCallback, useMemo } from "react";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { useVoteMarkers } from "./useVoteMarkers";

export const useVote = (proposalKey: PublicKey) => {
  const { info: proposal } = useProposal(proposalKey);
  const { positions, provider } = useHeliumVsrState();
  const voteMarkerKeys = useMemo(() => {
    return positions
      ? positions.map((p) => voteMarkerKey(p.mint, proposalKey)[0])
      : [];
  }, [positions]);
  const { accounts: markers } = useVoteMarkers(voteMarkerKeys);
  const voteWeights: BN[] | undefined = useMemo(() => {
    if (proposal && markers) {
      return markers.reduce((acc, marker) => {
        marker.info?.choices.forEach((choice) => {
          acc[choice] = (acc[choice] || new BN(0)).add(
            marker.info?.weight || new BN(0)
          );
        });
        return acc;
      }, new Array(proposal?.choices.length));
    }
  }, [proposal, markers]);
  const canVote = useCallback(
    (choice: number) => {
      if (!markers) return false;

      return markers.some((m) => {
        const noMarker = !m?.info;
        const maxChoicesReached =
          (m?.info?.choices.length || 0) >= (proposal?.maxChoicesPerVoter || 0);
        const alreadyVotedThisChoice = m.info?.choices.includes(choice);
        const canVote =
          noMarker || (!maxChoicesReached && !alreadyVotedThisChoice);
        return canVote;
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
              const maxChoicesReached =
                (marker?.choices.length || 0) >=
                (proposal?.maxChoicesPerVoter || 0);
              if (!marker || (!alreadyVotedThisChoice && !maxChoicesReached)) {
                return await vsrProgram.methods
                  .voteV0({
                    choice,
                  })
                  .accounts({
                    proposal: proposalKey,
                    voter: provider.wallet.publicKey,
                    position: position.pubkey,
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
    vote: execute,
    markers,
    voteWeights,
    canVote,
  };
};
