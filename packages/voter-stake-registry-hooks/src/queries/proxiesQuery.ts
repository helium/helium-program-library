import { VoteService } from "@helium/voter-stake-registry-sdk";
import { infiniteQueryOptions } from "@tanstack/react-query";

export function proxiesQuery({
  search,
  amountPerPage = 20,
  voteService,
}: {
  search: string;
  amountPerPage: number;
  voteService?: VoteService;
}) {
  return infiniteQueryOptions({
    enabled: !!voteService,
    queryKey: [
      "proxies",
      {
        ...voteService?.config,
        amountPerPage,
        search,
      },
    ],
    queryFn: async ({ pageParam = 1 }) => {
      const voters = await voteService!.getProxies({
        page: pageParam,
        limit: amountPerPage,
        query: search,
      });
      return voters;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, _, lastPageParam) => {
      if (lastPage.length < amountPerPage) {
        return undefined;
      }
      return lastPageParam + 1;
    },
  });
}
