import { useInfiniteQuery } from "@tanstack/react-query";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PublicKey } from "@solana/web3.js";

export function useVotesForWallet({
  wallet,
  amountPerPage = 20,
}: {
  wallet: PublicKey;
  amountPerPage: number;
}) {
  const { voteService } = useHeliumVsrState();
  return useInfiniteQuery({
    enabled: !!voteService,
    queryKey: [
      "votes",
      {
        registrar: voteService?.registrar.toBase58(),
        wallet: wallet.toBase58(),
      },
    ],
    queryFn: async ({ pageParam = 1 }) => {
      const voters = await voteService!.getVotesForWallet({
        page: pageParam,
        limit: amountPerPage,
        wallet,
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
