"use client";

import { useIsOwner } from "@/hooks/useIsOwner";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { useTransactionSubmission } from "@/hooks/useTransactionSubmission";
import { truncateAddress } from "@/lib/utils/misc";
import { CheckCircle2, XCircle, Plus } from "lucide-react";
import { Alert, AlertTitle } from "./ui/alert";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { CopyAddressButton } from "./ui/copy-address-button";
import { useAsyncCallback } from "react-async-hook";
import { HNT_MINT } from "@helium/spl-utils";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { client } from "@/lib/orpc";

interface DashboardHeaderProps {
  walletAddress: string;
}

export const DashboardHeader = ({ walletAddress }: DashboardHeaderProps) => {
  const isOwner = useIsOwner(walletAddress);
  const { data: tokenBalances, isLoading: isLoadingBalances } =
    useTokenBalances(walletAddress);
  const { submitTransactions } = useTransactionSubmission();
  const queryClient = useQueryClient();

  // Check if user has HNT token account
  const hasHntAccount = tokenBalances?.tokens.some(
    (token) => token.mint === HNT_MINT.toBase58()
  );

  const { loading: isCreatingHntAccount, execute: createHntAccount } =
    useAsyncCallback(async () => {
      const { transactionData } = await client.tokens.createHntAccount({
        walletAddress,
      });

      await submitTransactions(transactionData, {
        onSuccess: async () => {
          toast.success("HNT token account created successfully!");
          // Wait a bit before refreshing to ensure the transaction is processed
          await sleep(3000);
          // Refresh token balances to show the new account
          await queryClient.invalidateQueries({
            queryKey: ["token-balances", walletAddress],
          });
        },
      });
    });

  const formatUsdAmount = (amount: number) => {
    return amount.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  };

  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  return (
    <>
      <Alert
        className={`w-full ${
          isOwner
            ? "border-green-500 bg-green-50 dark:border-green-600 dark:bg-green-950/50"
            : "border-orange-500 bg-orange-50 dark:border-orange-600 dark:bg-orange-950/50"
        } border`}
      >
        <AlertTitle className="flex flex-col justify-between gap-1 md:flex-row">
          <div className="flex flex-none items-center gap-2">
            {isOwner ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <p className="text-sm text-green-600 dark:text-green-400">
                  You are the owner of this wallet
                  <span className="hidden md:inline">
                    : <CopyAddressButton address={walletAddress} />
                  </span>
                </p>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-orange-600 dark:text-orange-600" />
                <p className="text-sm text-orange-600 dark:text-orange-400">
                  You are not the owner of this wallet
                  <span className="hidden md:inline">
                    : <CopyAddressButton address={walletAddress} />
                  </span>
                </p>
              </>
            )}
          </div>
        </AlertTitle>
      </Alert>

      {/* HNT Token Account Alert */}
      {isOwner && !isLoadingBalances && !hasHntAccount && (
        <Alert className="w-full border border-blue-500 bg-blue-50 dark:border-blue-600 dark:bg-blue-950/50">
          <AlertTitle className="flex flex-col justify-between gap-4 md:flex-row">
            <div className="flex flex-none items-center gap-2">
              <Plus className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  Create HNT Token Account
                </p>
                <p className="mt-1 text-xs text-blue-600/80 dark:text-blue-400/80">
                  You need an HNT token account to receive HNT tokens from your
                  hotspots.
                </p>
              </div>
            </div>
            <Button
              onClick={createHntAccount}
              disabled={isCreatingHntAccount}
              size="sm"
              className="shrink-0"
            >
              {isCreatingHntAccount ? "Creating..." : "Create Account"}
            </Button>
          </AlertTitle>
        </Alert>
      )}
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm">Total Balance</p>
              {isLoadingBalances ? (
                <div className="flex items-center gap-2">
                  <div className="border-muted-foreground h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
                  <p className="text-foreground text-xl font-bold">
                    Loading...
                  </p>
                </div>
              ) : (
                <p className="text-foreground text-3xl font-bold">
                  {formatUsdAmount(tokenBalances?.totalBalanceUsd || 0)}{" "}
                  <span className="text-muted-foreground text-base font-normal">
                    USD
                  </span>
                </p>
              )}
            </div>
            <div className="text-muted-foreground/40 text-6xl font-light">
              $
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
};
