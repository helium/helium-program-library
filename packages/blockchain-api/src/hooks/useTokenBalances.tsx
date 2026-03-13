import { useQuery } from "@tanstack/react-query";
import { TokenBalanceData } from "@/types/tokens";
import { orpc } from "@/lib/orpc";

export function useTokenBalances(walletAddress: string) {
  return useQuery<TokenBalanceData>({
    ...orpc.tokens.getBalances.queryOptions({
      input: { walletAddress },
    }),
    refetchInterval: 30000,
    staleTime: 15000,
    enabled: !!walletAddress,
  });
}
