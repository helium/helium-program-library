import { useQuery } from "@tanstack/react-query";
import { VoteService } from "@helium/voter-stake-registry-sdk";
import { queryOptions } from "@tanstack/react-query";

export function dataBurnSplitQuery({
  voteService,
}: {
  voteService?: VoteService;
}) {
  return queryOptions({
    queryKey: [
      "dataBurnSplit",
      voteService?.config,
    ],
    queryFn: () => voteService!.getDataBurnSplit(),
    enabled: !!voteService,
  });
}


export const useDataBurnSplit = ({
  voteService,
}: {
  voteService?: VoteService;
}) => {
  return useQuery(dataBurnSplitQuery({
    voteService: voteService,
  }));
};
