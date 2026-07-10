import { publicProcedure } from "../../../procedures";
import * as multisig from "@sqds/multisig";
import { createSolanaConnection } from "@/lib/solana";
import { buildProposalVote, SQUADS_VOTE_ACTIONS } from "./helpers";

export const cancelProposal = publicProcedure.squads.cancelProposal.handler(
  async ({ input, errors }) => {
    const { connection } = createSolanaConnection(input.member);
    return buildProposalVote({
      input,
      connection,
      buildIx: multisig.instructions.proposalCancel,
      action: SQUADS_VOTE_ACTIONS.cancel,
      insufficientFunds: ({ required, available }) =>
        errors.INSUFFICIENT_FUNDS({
          message: "Insufficient SOL balance to cancel the proposal",
          data: { required, available },
        }),
    });
  },
);
