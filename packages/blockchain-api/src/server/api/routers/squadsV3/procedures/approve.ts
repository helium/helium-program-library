import { publicProcedure } from "../../../procedures";
import { buildProposalVote, createSquadsV3, SQUADS_V3_VOTE_ACTIONS } from "./helpers";

export const approveProposal = publicProcedure.squadsV3.approveProposal.handler(
  async ({ input, errors }) => {
    const { connection, squads } = createSquadsV3(input.member);
    return buildProposalVote({
      input,
      connection,
      squads,
      action: SQUADS_V3_VOTE_ACTIONS.approve,
      errors,
    });
  }
);
