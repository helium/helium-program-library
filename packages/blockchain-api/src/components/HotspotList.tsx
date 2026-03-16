"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Hotspot, HotspotType } from "@/types/hotspot";
import { useState } from "react";
import HotspotCard from "./HotspotCard";
import { Router } from "lucide-react";
import { useOwnedHotspots } from "@/hooks/useOwnedHotspots";
import { useIsOwner } from "@/hooks/useIsOwner";

interface HotspotListProps {
  walletAddress: string;
}

interface HotspotResponse {
  hotspots: Hotspot[];
  total: number;
  page: number;
  totalPages: number;
}

export default function HotspotList({ walletAddress }: HotspotListProps) {
  const isOwner = useIsOwner(walletAddress);
  const [type, setType] = useState<HotspotType>("all");
  const [page, setPage] = useState(1);
  const {
    data: ownedHotspots,
    isLoading,
    isError,
    error,
  } = useOwnedHotspots(walletAddress, {
    type,
    page,
  });

  const handleTypeChange = (value: string) => {
    setType(value as HotspotType);
    setPage(1);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="text-center p-8">
          <p className="text-muted-foreground">Loading hotspots...</p>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="text-center p-8">
          <p className="text-destructive">Error: {(error as Error).message}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Hotspots</h2>
        <Select value={type} onValueChange={handleTypeChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="iot">IoT</SelectItem>
            <SelectItem value="mobile">Mobile</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!ownedHotspots || ownedHotspots.hotspots.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-1 p-2">
            <Router className="w-10 h-10 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              No hotspots found for this wallet
            </p>
            <p className="text-sm text-muted-foreground/50">
              Hotspots associated with your wallet will appear here
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ownedHotspots.hotspots.map((hotspot) => (
              <HotspotCard
                key={hotspot.address}
                hotspot={hotspot as Hotspot}
                showCreateButton={isOwner && hotspot.owner === walletAddress}
                showStatus={true}
              />
            ))}
          </div>

          {ownedHotspots.totalPages > 1 && (
            <div className="flex justify-center items-center mt-6 gap-2">
              <Button
                variant="secondary"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span className="px-4 py-2 text-sm text-muted-foreground">
                Page {page} of {ownedHotspots.totalPages}
              </span>
              <Button
                variant="secondary"
                onClick={() =>
                  setPage((p) => Math.min(ownedHotspots.totalPages, p + 1))
                }
                disabled={page === ownedHotspots.totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
