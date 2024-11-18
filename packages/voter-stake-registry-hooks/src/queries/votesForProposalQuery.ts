import { VoteService } from "@helium/voter-stake-registry-sdk";
import { PublicKey } from "@solana/web3.js";
import { infiniteQueryOptions } from "@tanstack/react-query";

export const votesForProposalQuery = ({
  proposal,
  amountPerPage = 20,
  voteService,
}: {
  proposal: PublicKey;
  amountPerPage?: number;
  voteService?: VoteService;
}) => {
  return infiniteQueryOptions({
    enabled: !!voteService,
    queryKey: [
      "proposalVotes",
      {
        proposal: proposal.toBase58(),
      },
    ],
    queryFn: async ({ pageParam = 1 }) => {
      const votes = await voteService!.getVotesForProposal({
        page: pageParam,
        limit: amountPerPage,
        proposal,
      });
      return votes;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, _, lastPageParam) => {
      if (lastPage.length < amountPerPage) {
        return undefined;
      }
      return lastPageParam + 1;
    },
  });
};
