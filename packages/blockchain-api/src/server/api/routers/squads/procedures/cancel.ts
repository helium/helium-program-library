import { publicProcedure } from "../../../procedures";
import { createSolanaConnection } from "@/lib/solana";
import { buildProposalVote, SQUADS_VOTE_ACTIONS } from "./helpers";

export const cancelProposal = publicProcedure.squads.cancelProposal.handler(
  async ({ input, errors }) => {
    const { connection } = createSolanaConnection(input.member);
    return buildProposalVote({
      input,
      connection,
      action: SQUADS_VOTE_ACTIONS.cancel,
      errors,
    });
  }
);
