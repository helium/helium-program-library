import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { UseOwnedHotspotsOptions } from "@/types/hotspot";
import { orpc } from "@/lib/orpc";

export function useOwnedHotspots(
  walletAddress: string,
  options: UseOwnedHotspotsOptions = {},
) {
  const { type = "all", page = 1, limit = 10 } = options;

  return useQuery({
    ...orpc.hotspots.getHotspots.queryOptions({
      input: {
        walletAddress,
        type: type === "all" ? undefined : type,
        page,
        limit,
      },
    }),
    refetchInterval: 30000,
    staleTime: 15000,
    enabled: !!walletAddress,
    placeholderData: keepPreviousData,
  });
}
