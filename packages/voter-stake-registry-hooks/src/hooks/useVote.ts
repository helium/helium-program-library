import { useProposal } from "@helium/modular-governance-hooks";
import { Status, batchParallelInstructions, truthy } from "@helium/spl-utils";
import { init, voteMarkerKey } from "@helium/voter-stake-registry-sdk";
import { PublicKey, SYSVAR_CLOCK_PUBKEY, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import { useCallback, useMemo } from "react";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { useVoteMarkers } from "./useVoteMarkers";
import { calcPositionVotingPower } from "../utils/calcPositionVotingPower";

export const useVote = (proposalKey: PublicKey) => {
  const { info: proposal } = useProposal(proposalKey);
  const { positions, provider, registrar } = useHeliumVsrState();
  const voteMarkerKeys = useMemo(() => {
    return positions
      ? positions.map((p) => voteMarkerKey(p.mint, proposalKey)[0])
      : [];
  }, [positions]);
  const { accounts: markers } = useVoteMarkers(voteMarkerKeys);
  const voteWeights: BN[] | undefined = useMemo(() => {
    if (proposal && markers) {
      return markers.reduce((acc, marker, idx) => {
        const position = positions?.[idx];
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
  }, [proposal, markers, positions]);
  const voters: PublicKey[][] | undefined = useMemo(() => {
    if (proposal && markers) {
      const nonUniqueResult = markers.reduce((acc, marker, idx) => {
        const position = positions?.[idx];
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
  }, [markers, positions]);
  const canVote = useCallback(
    (choice: number) => {
      if (!markers) return false;

      return markers.some((m, index) => {
        const position = positions?.[index];
        const earlierDelegateVoted =
          position &&
          position.proxy &&
          m.info &&
          position.proxy.index > m.info.proxyIndex;
        const noMarker = !m?.info;
        const maxChoicesReached =
          (m?.info?.choices.length || 0) >= (proposal?.maxChoicesPerVoter || 0);
        const alreadyVotedThisChoice = m.info?.choices.includes(choice);
        const canVote =
          noMarker ||
          (!maxChoicesReached &&
            !alreadyVotedThisChoice &&
            !earlierDelegateVoted);
        return canVote;
      });
    },
    [markers]
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
      const isInvalid = !provider || !positions || positions.length === 0;

      if (isInvalid) {
        throw new Error(
          "Unable to vote without positions. Please stake tokens first."
        );
      } else {
        const clock = await provider.connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
        const unixNow = new BN(clock!.data.readBigInt64LE(8 * 4).toString());
        const vsrProgram = await init(provider);
        const instructions = (
          await Promise.all(
            // vote with bigger positions first.
            positions
              .sort((a, b) => {
                return -calcPositionVotingPower({
                  position: a,
                  registrar: registrar || null,
                  unixNow,
                }).cmp(
                  calcPositionVotingPower({
                    position: b,
                    registrar: registrar || null,
                    unixNow,
                  })
                );
              })
              .map(async (position, index) => {
                const marker = markers?.[index]?.info;
                const alreadyVotedThisChoice = marker?.choices.includes(choice);
                const maxChoicesReached =
                  (marker?.choices.length || 0) >=
                  (proposal?.maxChoicesPerVoter || 0);

                // Ignore positions that have 0 voting power and haven't already voted
                if (
                  !marker &&
                  calcPositionVotingPower({
                    position,
                    registrar: registrar || null,
                    unixNow,
                  }).isZero()
                ) {
                  return;
                }
                if (
                  !marker ||
                  (!alreadyVotedThisChoice && !maxChoicesReached)
                ) {
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

                    return await vsrProgram.methods
                      .proxiedVoteV0({
                        choice,
                      })
                      .accounts({
                        proposal: proposalKey,
                        voter: provider.wallet.publicKey,
                        position: position.pubkey,
                        registrar: registrar?.pubkey,
                      })
                      .instruction();
                  }
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
