"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CopyAddressButton } from "@/components/ui/copy-address-button";
import { Copy } from "lucide-react";
import BN from "bn.js";
import { humanReadable } from "@helium/spl-utils";
import { useSplitShares } from "@/hooks/useSplitShares";
import { truncateAddress } from "@/lib/utils/misc";
import { PublicKey } from "@solana/web3.js";

interface SplitDetailsProps {
  walletAddress: string;
  hotspotPubkey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SplitDetails({
  walletAddress,
  hotspotPubkey,
  open,
  onOpenChange,
}: SplitDetailsProps) {
  const { data, isLoading, isError, error } = useSplitShares(
    // Ensure that this is disabled until open
    open ? walletAddress : undefined,
    open ? hotspotPubkey : undefined,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Split details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {isLoading && (
            <p className="text-sm text-muted-foreground">
              Loading split recipients…
            </p>
          )}
          {isError && (
            <p className="text-sm text-destructive">
              {(error as Error)?.message || "Failed to load"}
            </p>
          )}
          {!!data && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Split</span>
                <CopyAddressButton address={data.splitAddress} />
              </div>

              <Card className="py-0">
                <CardContent className="p-0 divide-y">
                  {data.shares.map((s, idx) => {
                    const percentage = s.shares;
                    const fixed = s.fixed;
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">
                            <CopyAddressButton address={s.wallet} />
                          </span>

                          {s.delegate &&
                          s.delegate !== s.wallet &&
                          s.delegate !== PublicKey.default.toBase58() ? (
                            <span className="text-xs text-muted-foreground">
                              `Delegate: ${truncateAddress(s.delegate, 4, 4)}`
                            </span>
                          ) : null}
                        </div>
                        <div className="text-sm text-right">
                          {percentage !== undefined
                            ? `${(percentage * 100).toFixed(2)}%`
                            : `${fixed.uiAmountString} HNT/period`}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
