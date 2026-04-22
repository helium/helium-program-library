import { publicProcedure } from "@/server/api/procedures";
import { getProposalVotes } from "@/lib/queries/governance/votes";

export const getProposalVotesProcedure =
  publicProcedure.governance.getProposalVotes.handler(async ({ input }) => {
    return (await getProposalVotes(input.proposalKey)) as never;
  });
