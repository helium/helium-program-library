import { DashboardHeader } from "@/components/DashboardHeader";
import HotspotList from "@/components/HotspotList";
import Hydrate from "@/components/Hydrate";
import { Navbar } from "@/components/layout/Navbar";
import { Workspace } from "@/components/layout/Workspace";
import WelcomePacks from "@/components/WelcomePacks";
import { getQueryClient } from "@/lib/query-client";
import { getHotspotsByOwner } from "@/lib/queries/hotspots";
import { getTokenBalances } from "@/lib/queries/tokens";
import { TokenList } from "@/components/TokenList";
import { getWelcomePacksByOwner } from "@/lib/queries/welcome-packs";
import { dehydrate } from "@tanstack/react-query";
import { HotspotsData } from "@/types/hotspot";
import { VerificationOrBankAccounts } from "@/components/kyc/VerificationOrBankAccounts";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ walletAddress: string }>;
}) {
  const { walletAddress } = await params;
  const queryClient = getQueryClient();

  // prefetch tokens, hotspots, and welcome packs
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: ["token-balances", walletAddress],
      queryFn: () => getTokenBalances({ walletAddress }),
    }),
    queryClient.prefetchQuery({
      queryKey: ["owned-hotspots", walletAddress, "all", 1],
      queryFn: () =>
        getHotspotsByOwner({
          owner: walletAddress,
          type: "all",
          page: 1,
        }),
    }),
    queryClient.prefetchQuery({
      queryKey: ["welcome-packs", walletAddress],
      queryFn: () => getWelcomePacksByOwner(walletAddress),
    }),
  ]);

  const hotspotsData = queryClient.getQueryData<HotspotsData>([
    "owned-hotspots",
    walletAddress,
    "all",
    1,
  ]);

  const hasOwnedHotspots = (hotspotsData?.hotspots?.length ?? 0) > 0;
  const dehydratedState = dehydrate(queryClient);

  return (
    <>
      <Navbar showNav={false} />
      <Workspace>
        <Hydrate state={dehydratedState}>
          <div className="flex flex-col gap-4">
            <DashboardHeader walletAddress={walletAddress} />
            <TokenList walletAddress={walletAddress} />
            <VerificationOrBankAccounts walletAddress={walletAddress} />
            <HotspotList walletAddress={walletAddress} />
            {hasOwnedHotspots && <WelcomePacks walletAddress={walletAddress} />}
          </div>
        </Hydrate>
      </Workspace>
    </>
  );
}
