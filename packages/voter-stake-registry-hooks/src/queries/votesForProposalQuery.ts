import { VoteService } from "@helium/voter-stake-registry-sdk";
import { PublicKey } from "@solana/web3.js";
import { queryOptions } from "@tanstack/react-query";

export const votesForProposalQuery = ({
  proposal,
  amountPerPage = 20,
  voteService,
}: {
  proposal: PublicKey;
  amountPerPage?: number;
  voteService?: VoteService;
}) => {
  return queryOptions({
    queryKey: [
      "proposalVotes",
      {
        proposal: proposal.toBase58(),
      },
    ],
    queryFn: () => voteService!.getVotesForProposal(proposal),
    enabled: !!voteService,
  });
};
