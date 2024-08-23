import { VoteService } from "@helium/voter-stake-registry-sdk";
import { PublicKey } from "@solana/web3.js";
import { infiniteQueryOptions } from "@tanstack/react-query";

export const votesForWalletQuery = ({
  wallet,
  amountPerPage = 20,
  voteService,
}: {
  wallet: PublicKey;
  amountPerPage?: number;
  voteService?: VoteService;
}) => {
  return infiniteQueryOptions({
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
};
