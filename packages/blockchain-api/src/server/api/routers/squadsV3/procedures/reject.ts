import { publicProcedure } from "../../../procedures";
import { buildProposalVote, createSquadsV3, SQUADS_V3_VOTE_ACTIONS } from "./helpers";

export const rejectProposal = publicProcedure.squadsV3.rejectProposal.handler(
  async ({ input, errors }) => {
    const { connection, squads } = createSquadsV3(input.member);
    return buildProposalVote({
      input,
      connection,
      squads,
      action: SQUADS_V3_VOTE_ACTIONS.reject,
      errors,
    });
  }
);
