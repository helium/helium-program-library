"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMemo, useState, useEffect } from "react";
import { useTransactionSubmission } from "@/hooks/useTransactionSubmission";
import { useAsyncCallback } from "react-async-hook";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sleep } from "@helium/spl-utils";
import { client } from "@/lib/orpc";
import { TOKEN_MINTS } from "@/lib/constants/tokens";

interface TransferTokenModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletAddress: string;
  token?: {
    mint?: string;
    symbol?: string;
    decimals?: number;
    uiAmount?: number;
  };
  tokens?: {
    mint?: string;
    symbol?: string;
    decimals?: number;
    uiAmount?: number;
  }[];
}

export function TransferTokenModal({
  open,
  onOpenChange,
  walletAddress,
  token,
  tokens = [],
}: TransferTokenModalProps) {
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | undefined>();
  const { submitTransactions, isSubmitting } = useTransactionSubmission();
  const queryClient = useQueryClient();
  const [selectedMint, setSelectedMint] = useState<string>(
    token?.mint ?? tokens[0]?.mint ?? "SOL",
  );

  const effectiveToken = useMemo(() => {
    if (token) return token;
    const t = tokens.find((t) => t.mint === selectedMint);
    return t ?? tokens[0];
  }, [token, tokens, selectedMint]);

  const isSolSelected = useMemo(() => !effectiveToken?.mint, [effectiveToken]);
  const decimals = useMemo(
    () => effectiveToken?.decimals ?? (isSolSelected ? 9 : 0),
    [effectiveToken, isSolSelected],
  );
  const available = useMemo(
    () => effectiveToken?.uiAmount || 0,
    [effectiveToken],
  );
  const feeBufferSol = 0.01;
  const maxSendable = useMemo(
    () => (isSolSelected ? Math.max(available - feeBufferSol, 0) : available),
    [isSolSelected, available],
  );

  useEffect(() => {
    setAmount("");
    setError(undefined);
  }, [selectedMint]);

  const validate = (value: string) => {
    const v = value.trim();
    if (!v) {
      setError(undefined);
      return false;
    }
    const n = parseFloat(v);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Enter a valid amount greater than 0");
      return false;
    }
    if (n > maxSendable + 1e-12) {
      setError("Amount exceeds available balance");
      return false;
    }
    setError(undefined);
    return true;
  };

  const onMax = () => {
    const available = effectiveToken?.uiAmount || 0;
    if (isSolSelected) {
      const sendable = Math.max(available - feeBufferSol, 0);
      setAmount(sendable.toFixed(Math.min(decimals || 9, 9)));
    } else {
      setAmount(available.toString());
    }
    setError(undefined);
  };

  const { loading: isSubmittingTransfer, execute: onSubmit } = useAsyncCallback(
    async () => {
      if (!destination) {
        toast.error("Destination is required");
        return;
      }
      if (!validate(amount)) return;

      const mint = effectiveToken?.mint ?? TOKEN_MINTS.WSOL;
      const rawAmount = Math.round(
        parseFloat(amount) * Math.pow(10, decimals),
      ).toString();

      const { transactionData } = await client.tokens.transfer({
        walletAddress,
        destination,
        tokenAmount: { amount: rawAmount, mint },
      });

      await submitTransactions(transactionData, {
        onSuccess: async () => {
          toast.success("Transfer submitted");
          onOpenChange(false);
          await sleep(3000);
          await queryClient.invalidateQueries({
            queryKey: ["token-balances", walletAddress],
          });
        },
      });
    },
  );

  const formatAvailable = (value: number) => {
    const maxFrac = isSolSelected ? 8 : Math.min(decimals || 6, 6);
    return value.toLocaleString("en-US", { maximumFractionDigits: maxFrac });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer {effectiveToken?.symbol || "SOL"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!token && (
            <div className="space-y-2">
              <Label htmlFor="token">Token</Label>
              <Select value={selectedMint} onValueChange={setSelectedMint}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select token" />
                </SelectTrigger>
                <SelectContent>
                  {tokens.map((t) => (
                    <SelectItem key={t.mint ?? "SOL"} value={t.mint ?? "SOL"}>
                      {t.symbol || (t.mint ? t.mint.slice(0, 4) + "…" : "SOL")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="destination">Destination Address</Label>
            <Input
              id="destination"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Recipient wallet address"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="amount">Amount</Label>
              <span className="text-xs text-muted-foreground">
                Available: {formatAvailable(maxSendable)}{" "}
                {effectiveToken?.symbol || "SOL"}
              </span>
            </div>
            <div className="flex gap-2 items-center">
              <Input
                id="amount"
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  validate(e.target.value);
                }}
                placeholder="0.0"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onMax}
              >
                Max
              </Button>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting || isSubmittingTransfer}
            >
              Cancel
            </Button>
            <Button
              onClick={() => onSubmit()}
              disabled={
                isSubmitting ||
                isSubmittingTransfer ||
                !!error ||
                !amount ||
                !destination
              }
            >
              {isSubmittingTransfer ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-foreground" />
              ) : (
                "Send"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
