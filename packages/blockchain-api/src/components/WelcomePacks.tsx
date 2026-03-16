"use client";

import { useIsOwner } from "@/hooks/useIsOwner";
import { useTransactionSubmission } from "@/hooks/useTransactionSubmission";
import { WelcomePackWithHotspot } from "@/lib/queries/welcome-packs";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAsyncCallback } from "react-async-hook";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Share, Package2 } from "lucide-react";
import HotspotCard from "./HotspotCard";
import InviteModal from "./InviteModal";
import Spinner from "./Spinner";
import { Hotspot, HotspotsData, DeviceType } from "@/types/hotspot";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc";

export default function WelcomePacks({
  walletAddress,
}: {
  walletAddress: string;
}) {
  const { user: privyUser } = usePrivy();
  const queryClient = useQueryClient();
  const { submitTransactions } = useTransactionSubmission();
  const [selectedPack, setSelectedPack] = useState<WelcomePackWithHotspot>();
  const isOwner = useIsOwner(walletAddress);

  const {
    data: packs,
    isLoading,
    isError,
  } = useQuery({
    ...orpc.welcomePacks.list.queryOptions({
      input: { walletAddress },
    }),
    staleTime: 1000 * 5, // 5 seconds
  });

  const handleDeleteAsync = async (pack: WelcomePackWithHotspot) => {
    const walletAddr = privyUser?.wallet?.address;
    if (!walletAddr) throw new Error("Wallet not connected");

    const { transactionData } = await client.welcomePacks.delete({
      walletAddress: walletAddr,
      packId: pack.id,
    });

    const welcomePackQueryKey = ["welcome-packs", walletAddr];

    // Helper function to update all hotspot queries
    const updateHotspotQueries = (
      updater: (
        old: HotspotsData | undefined,
        queryKey: unknown[],
      ) => HotspotsData | undefined,
    ) => {
      const existingQueries = queryClient.getQueriesData<HotspotsData>({
        queryKey: ["owned-hotspots", walletAddr],
      });

      existingQueries.forEach(([queryKey]) => {
        queryClient.setQueryData(queryKey, (old: HotspotsData | undefined) =>
          updater(old, queryKey as unknown[]),
        );
      });
    };

    await submitTransactions(transactionData, {
      onSubmitted: () => {
        // Update welcome packs cache to show loading state
        queryClient.setQueryData(
          welcomePackQueryKey,
          (old: WelcomePackWithHotspot[] = []) =>
            old.map((p) => (p.id === pack.id ? { ...p, loading: true } : p)),
        );

        // Add hotspot back to all matching queries
        if (pack.hotspot) {
          updateHotspotQueries(
            (old: HotspotsData | undefined, queryKey: unknown[]) => {
              if (!old) return old;

              // Extract page from query key - it's the 4th element (index 3)
              const page = queryKey[3] as number;

              // Only add hotspot to first page
              if (page === 1) {
                // Ensure we're not adding a null hotspot
                const hotspotToAdd = pack.hotspot as Hotspot;
                hotspotToAdd.owner = walletAddr;
                return {
                  ...old,
                  hotspots: [hotspotToAdd, ...old.hotspots], // Add to start of array
                  total: old.total + 1,
                };
              }

              // For other pages, just update the total
              return {
                ...old,
                total: old.total + 1,
              };
            },
          );
        }
      },
      onSuccess: () => {
        // Remove pack from cache
        queryClient.setQueryData(
          welcomePackQueryKey,
          (old: WelcomePackWithHotspot[] = []) =>
            old.filter((p) => p.id !== pack.id),
        );
      },
      onError: () => {
        // Reset welcome pack loading state
        queryClient.setQueryData(
          welcomePackQueryKey,
          (old: WelcomePackWithHotspot[] = []) =>
            old.map((p) => (p.id === pack.id ? { ...p, loading: false } : p)),
        );

        // Remove hotspot from queries since delete failed
        if (pack.hotspot) {
          updateHotspotQueries(
            (old: HotspotsData | undefined, queryKey: unknown[]) => {
              if (!old) return old;
              return {
                ...old,
                hotspots: old.hotspots.filter(
                  (h) => h.asset !== pack.hotspot?.asset,
                ),
                total: old.total - 1,
              };
            },
          );
        }
      },
    });
  };

  const {
    execute: handleDelete,
    loading: isDeleting,
    error: deleteError,
  } = useAsyncCallback(handleDeleteAsync);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="text-center p-8 flex flex-col items-center gap-4">
          <Spinner />
          <p className="text-muted-foreground">
            Loading welcome packs for deployer...
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="text-center p-8">
          <p className="text-destructive">
            An error occurred while fetching data for this deployer
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Welcome Packs</h2>
      {deleteError && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="pt-6">
            <p className="text-destructive">{deleteError.message}</p>
          </CardContent>
        </Card>
      )}

      {!packs || packs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-1 p-2">
            <Package2 className="w-10 h-10 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              No welcome packs found for this wallet
            </p>
            <p className="text-sm text-muted-foreground/50">
              Create a welcome pack to get started
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {packs.map((pack) => {
            const packWithHotspot: WelcomePackWithHotspot = {
              ...pack,
              hotspot: pack.hotspot
                ? {
                    ...pack.hotspot,
                    deviceType: pack.hotspot.deviceType as DeviceType,
                  }
                : null,
            };
            return (
              <Card key={pack.id} className="relative">
                {pack.loading && (
                  <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg">
                    <Spinner />
                  </div>
                )}

                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Pack #{pack.id}</CardTitle>
                    {isOwner && (
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(packWithHotspot)}
                          disabled={isDeleting}
                          title="Delete welcome pack"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelectedPack(packWithHotspot)}
                          title="Generate invite"
                        >
                          <Share className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm">
                      <span className="font-medium text-muted-foreground">
                        Asset:
                      </span>{" "}
                      <span className="font-mono break-all">{pack.asset}</span>
                    </p>
                    <p className="text-sm">
                      <span className="font-medium text-muted-foreground">
                        SOL Amount:
                      </span>{" "}
                      <span className="font-mono">
                        {(parseInt(pack.solAmount, 10) / 1_000_000_000).toFixed(
                          4,
                        )}{" "}
                        SOL
                      </span>
                    </p>
                  </div>

                  {packWithHotspot.hotspot ? (
                    <div>
                      <h4 className="font-medium text-sm mb-2 text-muted-foreground">
                        Associated Hotspot:
                      </h4>
                      <HotspotCard
                        hotspot={packWithHotspot.hotspot}
                        nested={true}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No hotspot associated
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedPack && (
        <InviteModal
          isOpen={!!selectedPack}
          onClose={() => setSelectedPack(undefined)}
          pack={selectedPack}
        />
      )}
    </div>
  );
}
