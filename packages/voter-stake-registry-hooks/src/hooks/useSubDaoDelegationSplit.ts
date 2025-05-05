import { useQuery } from "@tanstack/react-query";
import { VoteService } from "@helium/voter-stake-registry-sdk";
import { queryOptions } from "@tanstack/react-query";

export function subDaoDelegationSplitQuery({
  voteService,
}: {
  voteService?: VoteService;
}) {
  return queryOptions({
    queryKey: [
      "subDaoDelegationSplit",
      voteService?.config,
    ],
    queryFn: () => voteService!.getSubDaoDelegationSplit(),
    enabled: !!voteService,
  });
}


export const useSubDaoDelegationSplit = ({
  voteService,
}: {
  voteService?: VoteService;
}) => {
  return useQuery(subDaoDelegationSplitQuery({
    voteService: voteService,
  }));
};
