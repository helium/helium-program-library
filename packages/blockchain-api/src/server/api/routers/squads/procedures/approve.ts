import { publicProcedure } from "../../../procedures";
import { createSolanaConnection } from "@/lib/solana";
import { buildProposalVote, SQUADS_VOTE_ACTIONS } from "./helpers";

export const approveProposal = publicProcedure.squads.approveProposal.handler(
  async ({ input, errors }) => {
    const { connection } = createSolanaConnection(input.member);
    return buildProposalVote({
      input,
      connection,
      action: SQUADS_VOTE_ACTIONS.approve,
      errors,
    });
  }
);
