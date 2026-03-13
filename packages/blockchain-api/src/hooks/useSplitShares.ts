import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";

export interface MiniFanoutShareV0 {
  wallet: string;
  delegate: string;
  fixed: number;
  shares: number;
}

export interface SplitResponse {
  walletAddress: string;
  hotspotPubkey: string;
  splitAddress: string;
  shares: MiniFanoutShareV0[];
}

export function useSplitShares(
  walletAddress: string | undefined,
  hotspotPubkey: string | undefined,
) {
  return useQuery({
    ...orpc.hotspots.getSplit.queryOptions({
      input: {
        walletAddress: walletAddress!,
        hotspotPubkey: hotspotPubkey!,
      },
    }),
    enabled: !!walletAddress && !!hotspotPubkey,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}
