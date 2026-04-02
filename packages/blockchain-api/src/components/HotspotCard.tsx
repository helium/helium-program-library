import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Hotspot } from "@/types/hotspot";
import { deviceTypeImageUrl, formatDeviceType } from "@/lib/utils/hotspot";
import { cn, truncateAddress } from "@/lib/utils/misc";
import { Copy, Router, Split } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import CreateWelcomePackForm from "./CreateWelcomePackForm";
import { useParams } from "next/navigation";
import { useAsyncCallback } from "react-async-hook";
import { useQueryClient } from "@tanstack/react-query";
import { useTransactionSubmission } from "@/hooks/useTransactionSubmission";
import BN from "bn.js";
import { humanReadable } from "@helium/spl-utils";
import { SplitDetails } from "./SplitDetails";
import Image from "next/image";
import { client } from "@/lib/orpc";

interface HotspotCardProps {
  hotspot: Hotspot;
  showCreateButton?: boolean;
  showStatus?: boolean;
  nested?: boolean;
}

export default function HotspotCard({
  hotspot,
  showCreateButton = false,
  showStatus = false,
  nested = true,
}: HotspotCardProps) {
  const params = useParams();
  const currentWallet = params.walletAddress as string;
  const [isCreateWelcomePackOpen, setIsCreateWelcomePackOpen] = useState(false);
  const queryClient = useQueryClient();
  const { submitTransactions } = useTransactionSubmission();
  const [showSplitDetails, setShowSplitDetails] = useState(false);
  const location =
    [hotspot.city, hotspot.state, hotspot.country].filter(Boolean).join(", ") ||
    "Unknown";

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(hotspot.entityKey);
      toast.success("Address copied to clipboard");
    } catch (error) {
      console.error("Failed to copy address:", error);
      toast.error("Failed to copy address");
    }
  };

  const { loading: isRemoving, execute: removeSplit } = useAsyncCallback(
    async () => {
      const { transactionData } = await client.hotspots.deleteSplit({
        walletAddress: currentWallet,
        hotspotPubkey: hotspot.address,
      });

      // Helper function to update hotspot queries
      const updateHotspotQueries = (updater: (old: Hotspot) => Hotspot) => {
        const existingQueries = queryClient.getQueriesData<any>({
          queryKey: ["owned-hotspots"],
        });

        existingQueries.forEach(([queryKey, queryData]) => {
          queryClient.setQueryData(queryKey, {
            ...queryData,
            hotspots: queryData.hotspots.map((h: Hotspot) =>
              h.asset === hotspot.asset ? updater(h) : h,
            ),
          });
        });
      };

      // Optimistically update the UI
      const previousShares = hotspot.shares;

      await submitTransactions(transactionData, {
        onSubmitted: () => {
          updateHotspotQueries((h) => ({
            ...h,
            shares: undefined,
            ownershipType: "owner",
          }));
        },
        onError: (error) => {
          // Revert the optimistic update on error
          updateHotspotQueries((h) => ({ ...h, shares: previousShares }));
        },
      });
    },
  );

  // Mock status - replace with actual status from hotspot data when available
  const hasStatusData = hotspot.isOnline !== undefined;
  const isOnline = hotspot.isOnline;
  const deviceImageUrl = deviceTypeImageUrl(hotspot.deviceType);

  return (
    <>
      <Card
        className={cn(
          "flex-1 w-full md:max-w-sm",
          nested && "bg-muted/45 md:max-w-full",
        )}
      >
        <CardContent>
          <div className="flex items-center">
            <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center mr-4 shrink-0">
              <div className="w-10 h-10 flex items-center justify-center">
                {deviceImageUrl ? (
                  <Image
                    src={deviceImageUrl}
                    width={40}
                    height={40}
                    className="w-10 h-10"
                    alt={formatDeviceType(hotspot.deviceType)}
                  />
                ) : (
                  <Router className="w-10 h-10 text-gray-500" />
                )}
              </div>
            </div>
            <div className="flex-1 gap-0">
              <h3 className="text-lg font-semibold text-foreground mb-1">
                {hotspot.name}
              </h3>
              <p className="text-sm text-muted-foreground leading-tight font-normal">
                Location: {location}
              </p>
              <Button
                variant="link"
                onClick={copyAddress}
                size="sm"
                className="font-mono text-xs text-muted-foreground/50 hover:text-foreground !p-0 !m-0 h-auto gap-0"
              >
                <span>{truncateAddress(hotspot.entityKey, 6, 6)}</span>
                <Copy className="h-3 w-3 ml-2" />
              </Button>
            </div>
          </div>
          <div
            className={cn(
              "flex flex-col space-y-2",
              showCreateButton && "mt-4",
            )}
          >
            <div className="flex flex-wrap gap-2">
              {showStatus && (
                <span
                  className={cn(
                    "text-xs px-2 py-1 rounded-full",
                    !hasStatusData
                      ? "bg-muted text-muted-foreground"
                      : isOnline
                        ? "bg-green-500 text-green-100"
                        : "bg-red-500 text-red-100",
                  )}
                >
                  {!hasStatusData
                    ? "Status Unknown"
                    : isOnline
                      ? "Online"
                      : "Offline"}
                </span>
              )}
              {hotspot.owner && hotspot.owner !== currentWallet && (
                <span className="text-xs px-2 py-1 rounded-full bg-blue-500 text-blue-100">
                  Owned by {truncateAddress(hotspot.owner, 4, 4)}
                </span>
              )}
              {hotspot.shares &&
                hotspot.shares?.percentage != 1 &&
                (Number(hotspot.shares.percentage) > 0 ||
                  !new BN(hotspot.shares?.fixed || "0").isZero()) && (
                  <button
                    className="cursor-pointer text-xs px-2 py-1 rounded-full bg-purple-500 text-purple-100 hover:opacity-90"
                    onClick={() => setShowSplitDetails(true)}
                    title="View split recipients"
                  >
                    {Number(hotspot.shares.percentage) > 0
                      ? `${(hotspot.shares.percentage || 0) * 100}% Rewards`
                      : `${humanReadable(
                          new BN(hotspot.shares.fixed || "0") as any,
                          8,
                        )} HNT/Period`}
                  </button>
                )}
            </div>
            <div className="flex flex-wrap gap-2">
              {showCreateButton &&
                (hotspot.ownershipType === "owner" ||
                  hotspot.ownershipType === "direct") && (
                  <Button
                    variant="secondary"
                    onClick={() => setIsCreateWelcomePackOpen(true)}
                    size="sm"
                    className="px-4 py-2 text-sm"
                  >
                    Create Pack
                  </Button>
                )}
              {showCreateButton && hotspot.ownershipType === "fanout" ? (
                <Button
                  variant="destructive"
                  onClick={removeSplit}
                  size="sm"
                  className="px-4 py-2 text-sm"
                  disabled={isRemoving}
                >
                  {isRemoving ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-foreground"></div>
                  ) : (
                    <>
                      <Split className="h-4 w-4 mr-2" />
                      Remove Split
                    </>
                  )}
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={isCreateWelcomePackOpen}
        onOpenChange={setIsCreateWelcomePackOpen}
      >
        <DialogContent className="max-w-screen h-screen md:max-w-2xl md:max-h-[90vh] md:h-auto overflow-y-auto">
          <CreateWelcomePackForm
            hotspot={hotspot}
            onClose={() => setIsCreateWelcomePackOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <SplitDetails
        walletAddress={currentWallet}
        hotspotPubkey={hotspot.address}
        open={showSplitDetails}
        onOpenChange={setShowSplitDetails}
      />
    </>
  );
}
