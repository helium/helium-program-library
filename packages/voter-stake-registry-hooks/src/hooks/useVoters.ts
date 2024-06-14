import { useInfiniteQuery } from "@tanstack/react-query";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";

export function useVoters({
  search,
  amountPerPage = 20,
}: {
  search: string;
  amountPerPage: number;
}) {
  const { voteService } = useHeliumVsrState();
  return useInfiniteQuery({
    enabled: !!voteService,
    queryKey: [
      "voters",
      {
        registrar: voteService?.registrar.toBase58(),
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
