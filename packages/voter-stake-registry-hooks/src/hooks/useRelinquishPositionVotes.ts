import { init as initOrg, proposalKey } from "@helium/organization-sdk";
import { init as initProposal } from "@helium/proposal-sdk";
import { Status, batchParallelInstructions, truthy } from "@helium/spl-utils";
import {
  init as initVsr,
  voteMarkerKey,
} from "@helium/voter-stake-registry-sdk";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta } from "../sdk/types";
import { MAX_TRANSACTIONS_PER_SIGNATURE_BATCH } from "../constants";

export const useRelinquishPositionVotes = () => {
  const { provider } = useHeliumVsrState();
  const { error, loading, execute } = useAsyncCallback(
    async ({
      position,
      organization,
      onInstructions,
      maxSignatureBatch = MAX_TRANSACTIONS_PER_SIGNATURE_BATCH,
      onProgress,
    }: {
      position: PositionWithMeta;
      organization: PublicKey;
      // Instead of sending the transaction, let the caller decide
      onInstructions?: (
        instructions: TransactionInstruction[]
      ) => Promise<void>;
      maxSignatureBatch?: number;
      onProgress?: (status: Status) => void;
    }) => {
      const isInvalid =
        !provider || !provider.wallet || position.numActiveVotes === 0;

      if (isInvalid) {
        throw new Error("Unable to relinquish votes, Invalid params");
      }
      {
        const orgProgram = await initOrg(provider);
        const proposalProgram = await initProposal(provider);
        const vsrProgram = await initVsr(provider);
        const positionAcc = await vsrProgram.account.positionV0.fetch(
          position.pubkey
        );
        const organizationAcc =
          await orgProgram.account.organizationV0.fetchNullable(organization);

        if (!organizationAcc) {
          throw new Error("Organization not found");
        }

        const proposalKeys = Array(organizationAcc?.numProposals)
          .fill(0)
          .map((_, index) => proposalKey(organization, index)[0])
          .reverse();

        const proposals = await Promise.all(
          proposalKeys.map(async (p) => ({
            account: await proposalProgram.account.proposalV0.fetch(p),
            pubkey: p,
          }))
        );

        const activeProposals = proposals.filter(
          (p) =>
            typeof p.account.state.voting !== "undefined" &&
            typeof p.account.state.resolved === "undefined"
        );

        const markers = (
          await Promise.all(
            activeProposals
              .map((p) => voteMarkerKey(positionAcc.mint, p.pubkey)[0])
              .map(
                async (marker) =>
                  await vsrProgram.account.voteMarkerV0.fetchNullable(marker)
              )
          )
        ).filter(truthy);

        const instructions = (
          await Promise.all(
            markers.map(
              async (marker) =>
                await Promise.all(
                  marker.choices.map(async (choice) => {
                    return await vsrProgram.methods
                      .relinquishVoteV1({
                        choice,
                      })
                      .accountsPartial({
                        proposal: marker.proposal,
                        voter: provider.wallet.publicKey,
                        position: position.pubkey,
                      })
                      .instruction();
                  })
                )
            )
          )
        ).flat();

        if (onInstructions) {
          await onInstructions(instructions);
        } else {
          await batchParallelInstructions({
            provider,
            instructions,
            onProgress,
            triesRemaining: 10,
            extraSigners: [],
            maxSignatureBatch
          });
        }
      }
    }
  );

  return {
    error,
    loading,
    relinquishPositionVotes: execute,
  };
};
