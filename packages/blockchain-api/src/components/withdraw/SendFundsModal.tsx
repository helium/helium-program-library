"use client";

import { useTokenBalances } from "@/hooks/useTokenBalances";
import { useTransactionSubmission } from "@/hooks/useTransactionSubmission";
import { HNT_MINT, toNumber } from "@helium/spl-utils";
import type { TransactionData, QuoteResponse } from "@helium/blockchain-api";
import type { BridgeTransfer } from "@helium/blockchain-api/schemas/fiat";
import { usePrivy } from "@privy-io/react-auth";
import { useWalletAddress } from "@/hooks/useWalletAddress";
import BN from "bn.js";
import { useEffect, useMemo } from "react";
import { useAsyncCallback } from "react-async-hook";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { client } from "@/lib/orpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";

// Add debounce utility function
const debounce = <F extends (...args: any[]) => any>(
  func: F,
  waitFor: number,
) => {
  let timeout: NodeJS.Timeout;

  return (...args: Parameters<F>): Promise<ReturnType<F>> =>
    new Promise((resolve) => {
      if (timeout) {
        clearTimeout(timeout);
      }

      timeout = setTimeout(() => resolve(func(...args)), waitFor);
    });
};

// Helper function to format USD with floor rounding
const formatUsd = (value: number, decimals = 2, withSlippage = false) => {
  const multiplier = Math.pow(10, decimals);
  const slippageAdjustedValue = withSlippage ? value * 0.99 : value; // 1% slippage buffer
  return (Math.floor(slippageAdjustedValue * multiplier) / multiplier).toFixed(
    decimals,
  );
};

// Helper function to ceil to nearest cent
const ceilToCent = (amount: number) => {
  return Math.ceil(amount * 100) / 100;
};

interface SendResponse {
  transactionData: TransactionData;
  bridgeTransfer: BridgeTransfer;
}

const getQuote = async (
  usdAmount: string,
  bankAccountId: string,
): Promise<QuoteResponse | null> => {
  try {
    return await client.fiat.getSendQuote({
      id: bankAccountId,
      usdAmount,
    });
  } catch (error) {
    console.error("Error getting quote:", error);
    return null;
  }
};

const sendFunds = async ({
  userAddress,
  quoteResponse,
  bankAccountId,
}: {
  userAddress: string;
  quoteResponse: QuoteResponse;
  bankAccountId: string;
}): Promise<SendResponse> => {
  return await client.fiat.sendFunds({
    id: bankAccountId,
    userAddress,
    quoteResponse,
  });
};

const updateTransferSignature = async (
  bridgeTransferId: string,
  signature: string,
) => {
  try {
    await client.fiat.updateTransfer({
      id: bridgeTransferId,
      solanaSignature: signature,
    });
  } catch (error) {
    console.error("Failed to update transfer signature:", error);
  }
};

interface BridgeFees {
  developer_fee: string;
  developer_fee_percent: number;
}

interface SendFundsModalProps {
  isOpen: boolean;
  onClose: () => void;
  bankAccount: {
    id: string;
  };
}

interface FormData {
  usdAmount: string;
}

export function SendFundsModal({
  isOpen,
  onClose,
  bankAccount,
}: SendFundsModalProps) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>();
  const { user } = usePrivy();
  const walletAddress = useWalletAddress();
  const { submitTransactions } = useTransactionSubmission();
  const { data: tokenBalances } = useTokenBalances(walletAddress || "");
  const usdAmount = watch("usdAmount");

  const {
    execute: executeQuote,
    result: quoteResult,
    loading: isLoadingQuote,
  } = useAsyncCallback(async (amount: string) =>
    getQuote(amount, bankAccount.id),
  );

  const { data: fees } = useQuery({
    ...orpc.fiat.getFees.queryOptions({
      input: {},
    }),
  });

  // Calculate total fees if we have both fees and amount
  const totalFees = useMemo(() => {
    if (!fees || !usdAmount) return null;
    const amount = parseFloat(usdAmount);
    if (isNaN(amount)) return null;

    const fixedFee = parseFloat(fees.developer_fee);
    const percentageFee = ceilToCent(
      amount * (fees.developer_fee_percent / 100),
    );

    return {
      fixed: fixedFee,
      percentage: percentageFee,
      total: fixedFee + percentageFee,
    };
  }, [fees, usdAmount]);

  const { execute: executeSubmit, loading: isSubmitting } = useAsyncCallback(
    async (data: FormData) => {
      if (!hntToken) {
        throw new Error("HNT token not found");
      }
      if (!walletAddress) {
        throw new Error("Please connect your wallet first");
      }
      if (isLoadingQuote || !quoteResult) {
        throw new Error("Please wait for quote to load");
      }

      const { transactionData, bridgeTransfer } = await sendFunds({
        userAddress: walletAddress!,
        quoteResponse: quoteResult,
        bankAccountId: bankAccount.id,
      });

      await submitTransactions(transactionData, {
        onSuccess: async (batchId, signatures) => {
          // Update the transfer with the Solana transaction signature
          await updateTransferSignature(bridgeTransfer.id, signatures[0]);

          toast.success("Funds sent successfully");
          // Invalidate token balances query after 2 seconds
          setTimeout(() => {
            queryClient.invalidateQueries({
              queryKey: ["token-balances", walletAddress],
            });
          }, 2000);
          onClose();
        },
      });
    },
  );

  // Create debounced version of executeQuote
  const debouncedExecuteQuote = useMemo(
    () => debounce((amount: string) => executeQuote(amount), 500),
    [executeQuote],
  );

  useEffect(() => {
    if (usdAmount) {
      debouncedExecuteQuote(usdAmount);
    }
  }, [usdAmount, debouncedExecuteQuote]);

  // Get total USD value of HNT
  const hntToken = useMemo(
    () =>
      tokenBalances?.tokens.find((token) => token.mint === HNT_MINT.toBase58()),
    [tokenBalances],
  );
  const totalUsdValue = hntToken?.balanceUsd || 0;

  const handleMaxClick = () => {
    const hntToken = tokenBalances?.tokens.find(
      (token) => token.mint === HNT_MINT.toBase58(),
    );
    if (hntToken?.balanceUsd) {
      setValue("usdAmount", formatUsd(hntToken.balanceUsd, 2, true));
    }
  };

  const onSubmit = async (data: FormData) => {
    try {
      await executeSubmit(data);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send funds",
      );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Funds</DialogTitle>
          <DialogDescription>
            Enter the amount in USD you want to send to your bank account.
            Deposits will be processed via ACH daily at 1:00PM EST. There is a
            minimum of $1 to process withdrawals.
            {fees && (
              <>
                <br />
                <br />
                There is a fixed fee of ${fees.developer_fee} and a percentage
                fee of {fees.developer_fee_percent}% per withdrawal.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="usdAmount">Amount (USD)</Label>
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">
                  Available: ${formatUsd(totalUsdValue, 2, true)}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleMaxClick}
                  className="h-6 text-xs"
                >
                  Max
                </Button>
              </div>
            </div>
            <Input
              id="usdAmount"
              type="number"
              step="0.01"
              {...register("usdAmount", {
                required: "Amount is required",
                validate: (value) => {
                  const numValue = parseFloat(value);
                  if (numValue <= 0) return "Amount must be greater than 0";
                  if (numValue > totalUsdValue) return "Insufficient balance";

                  // Calculate amount after fees
                  if (fees) {
                    const fixedFee = parseFloat(fees.developer_fee);
                    const percentageFee = ceilToCent(
                      numValue * (fees.developer_fee_percent / 100),
                    );
                    const totalFeeAmount = fixedFee + percentageFee;
                    const amountAfterFees = numValue - totalFeeAmount;

                    if (amountAfterFees < 1)
                      return "Amount after fees must be at least $1";
                  }

                  return true;
                },
              })}
            />
            {errors.usdAmount && (
              <p className="text-sm text-destructive">
                {errors.usdAmount.message}
              </p>
            )}
            {quoteResult && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  ≈ {toNumber(new BN(quoteResult.inAmount), 8)} HNT
                </p>
                {totalFees !== null && (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Fixed Fee: ${formatUsd(totalFees.fixed, 2)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Percentage Fee: ${formatUsd(totalFees.percentage, 2)} (
                      {fees?.developer_fee_percent}%)
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Total Fees: ${formatUsd(totalFees.total, 2)}
                    </p>
                    <p className="text-sm">
                      You will receive: $
                      {formatUsd(parseFloat(usdAmount) - totalFees.total, 2)}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoadingQuote || !quoteResult || isSubmitting}
            >
              {isSubmitting
                ? "Sending..."
                : isLoadingQuote
                  ? "Loading quote..."
                  : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
