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
    (token) => token.mint === HNT_MINT.toBase58(),
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
            ? "bg-green-50 border-green-500 dark:bg-green-950/50 dark:border-green-600"
            : "bg-orange-50 border-orange-500 dark:bg-orange-950/50 dark:border-orange-600"
        } border`}
      >
        <AlertTitle className="flex flex-col md:flex-row justify-between gap-1">
          <div className="flex flex-none gap-2 items-center">
            {isOwner ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                <p className="text-sm text-green-600 dark:text-green-400">
                  You are the owner of this wallet
                  <span className="hidden md:inline">
                    : <CopyAddressButton address={walletAddress} />
                  </span>
                </p>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 text-orange-600 dark:text-orange-600" />
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
        <Alert className="w-full bg-blue-50 border-blue-500 dark:bg-blue-950/50 dark:border-blue-600 border">
          <AlertTitle className="flex flex-col md:flex-row justify-between gap-4">
            <div className="flex flex-none gap-2 items-center">
              <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                  Create HNT Token Account
                </p>
                <p className="text-xs text-blue-600/80 dark:text-blue-400/80 mt-1">
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
              <p className="text-sm text-muted-foreground">Total Balance</p>
              {isLoadingBalances ? (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                  <p className="text-xl font-bold text-foreground">
                    Loading...
                  </p>
                </div>
              ) : (
                <p className="text-3xl font-bold text-foreground">
                  {formatUsdAmount(tokenBalances?.totalBalanceUsd || 0)}{" "}
                  <span className="text-base font-normal text-muted-foreground">
                    USD
                  </span>
                </p>
              )}
            </div>
            <div className="text-6xl font-light text-muted-foreground/40">
              $
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
};
