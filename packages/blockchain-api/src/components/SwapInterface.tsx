"use client";

import { useState, useEffect, useCallback } from "react";
import { useAsyncCallback } from "react-async-hook";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { usePrivy } from "@privy-io/react-auth";
import { ConnectWalletButton } from "@/components/auth/ConnectWalletButton";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { useTransactionSubmission } from "@/hooks/useTransactionSubmission";
import { useWalletAddress } from "@/hooks/useWalletAddress";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { client } from "@/lib/orpc";
import type { QuoteResponse } from "@helium/blockchain-api";

interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  tags?: string[];
}

export function SwapInterface() {
  const { ready, authenticated, user } = usePrivy();
  const walletAddress = useWalletAddress();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [fromToken, setFromToken] = useState<Token | null>(null);
  const [toToken, setToToken] = useState<Token | null>(null);
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fromTokenSearch, setFromTokenSearch] = useState("");
  const [toTokenSearch, setToTokenSearch] = useState("");

  // Get user's token balances
  const { data: tokenBalances } = useTokenBalances(walletAddress || "");

  // Transaction submission hook
  const { submitTransactions } = useTransactionSubmission();

  // Query client for refreshing data
  const queryClient = useQueryClient();

  // Load tokens
  const { execute: loadTokens, loading: isLoadingTokens } = useAsyncCallback(
    async () => {
      const data = await client.swap.getTokens({ limit: 50 });
      setTokens(data.tokens);

      // Set default tokens (HNT should be first, then SOL, then USDC)
      if (data.tokens.length > 0) {
        setFromToken(data.tokens[0]); // HNT (now first)
        // Find SOL or USDC for the second token
        const solToken = data.tokens.find((t: Token) => t.symbol === "SOL");
        const usdcToken = data.tokens.find((t: Token) => t.symbol === "USDC");
        setToToken(solToken || usdcToken || data.tokens[1]);
      }
    },
    {
      onError: (error) => {
        console.error("Error loading tokens:", error);
        setError("Failed to load tokens");
      },
    },
  );

  // Get quote
  const { execute: getQuote, loading: isLoadingQuote } = useAsyncCallback(
    async () => {
      if (
        !fromToken ||
        !toToken ||
        !fromAmount ||
        parseFloat(fromAmount) <= 0
      ) {
        setQuote(null);
        setToAmount("");
        return;
      }

      setError(null);

      const amountInSmallestUnit = (
        parseFloat(fromAmount) * Math.pow(10, fromToken.decimals)
      ).toString();

      const quoteData = await client.swap.getQuote({
        inputMint: fromToken.address,
        outputMint: toToken.address,
        amount: amountInSmallestUnit,
        swapMode: "ExactIn",
        slippageBps: 50,
      });

      setQuote(quoteData);

      // Convert output amount to human readable format
      const outputAmount =
        parseFloat(quoteData.outAmount) / Math.pow(10, toToken.decimals);
      setToAmount(outputAmount.toFixed(6));
    },
    {
      onError: (error: Error) => {
        console.error("Error getting quote:", error);
        setError(error.message || "Failed to get quote");
        setQuote(null);
        setToAmount("");
      },
    },
  );

  // Swap transaction submission
  const { execute: executeSwap, loading: isSwapping } = useAsyncCallback(
    async () => {
      if (!authenticated || !user || !quote || !fromToken || !toToken) {
        throw new Error(
          "Please connect your wallet and ensure you have a valid quote",
        );
      }

      setError(null);

      // Get swap instructions
      const transactionData = await client.swap.getInstructions({
        quoteResponse: quote,
        userPublicKey: walletAddress || "",
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            maxLamports: 1000000,
            priorityLevel: "medium",
          },
        },
      });

      // Submit the transaction using the standard transaction submission system
      await submitTransactions(transactionData, {
        onSuccess: async (batchId, signatures) => {
          toast.success("Swap transaction submitted successfully!", {
            description: `Transaction ID: ${batchId}`,
          });

          // Clear the form
          setFromAmount("");
          setToAmount("");
          setQuote(null);

          // Refresh token balances after a delay
          setTimeout(() => {
            queryClient.invalidateQueries({
              queryKey: ["token-balances", walletAddress],
            });
          }, 2000);
        },
        onError: (error) => {
          console.error("Swap transaction failed:", error);
          toast.error("Swap transaction failed", {
            description: error.message || "Transaction submission failed",
          });
        },
      });
    },
    {
      onError: (error: Error) => {
        console.error("Error executing swap:", error);
        setError(error.message || "Failed to execute swap");
        toast.error("Swap failed", {
          description: error.message || "Failed to execute swap",
        });
      },
    },
  );

  // Get user's balance for the selected from token
  const getFromTokenBalance = () => {
    if (!fromToken || !tokenBalances) return 0;

    // Check if it's SOL
    if (fromToken.symbol === "SOL") {
      return tokenBalances.solBalance || 0;
    }

    // Check SPL tokens
    const tokenBalance = tokenBalances.tokens?.find(
      (t) => t.mint === fromToken.address,
    );
    return tokenBalance
      ? parseFloat(tokenBalance.balance) / Math.pow(10, fromToken.decimals)
      : 0;
  };

  // Handle Max button click
  const handleMaxClick = () => {
    const balance = getFromTokenBalance();
    setFromAmount(balance.toString());
  };

  // Filter tokens based on search
  const filteredFromTokens = tokens.filter(
    (token) =>
      token.symbol.toLowerCase().includes(fromTokenSearch.toLowerCase()) ||
      token.name.toLowerCase().includes(fromTokenSearch.toLowerCase()) ||
      token.address.toLowerCase().includes(fromTokenSearch.toLowerCase()),
  );

  const filteredToTokens = tokens.filter(
    (token) =>
      token.symbol.toLowerCase().includes(toTokenSearch.toLowerCase()) ||
      token.name.toLowerCase().includes(toTokenSearch.toLowerCase()) ||
      token.address.toLowerCase().includes(toTokenSearch.toLowerCase()),
  );

  // Load tokens on component mount
  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  // Debounced quote fetching
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      getQuote();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [getQuote, fromToken, toToken, fromAmount]);

  const handleSwapTokens = () => {
    const tempToken = fromToken;
    const tempAmount = fromAmount;

    setFromToken(toToken);
    setToToken(tempToken);
    setFromAmount(toAmount);
    setToAmount(tempAmount);
  };

  if (!ready) {
    return (
      <div className="w-full max-w-lg mx-auto">
        <Card>
          <CardContent className="p-8">
            <div className="text-center space-y-4">
              <div className="w-8 h-8 border-2 border-muted border-t-foreground rounded-full animate-spin mx-auto"></div>
              <div className="text-muted-foreground">
                Loading swap interface...
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="w-full max-w-lg mx-auto">
        <Card>
          <CardHeader className="text-center pb-6">
            <CardTitle className="text-2xl font-bold">Connect Wallet</CardTitle>
            <CardDescription className="text-base">
              Connect your wallet to start swapping tokens
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-8">
            <ConnectWalletButton className="w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg mx-auto">
      <Card>
        <CardHeader className="text-center pb-6">
          <CardTitle className="text-2xl font-bold">Token Swap</CardTitle>
          <CardDescription className="text-base">
            Trade tokens on Solana using Jupiter&apos;s best routes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 px-6 pb-8">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* From Token */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label
                htmlFor="from-token"
                className="text-sm font-medium text-muted-foreground"
              >
                From
              </Label>
              {fromToken && tokenBalances && (
                <span className="text-xs text-muted-foreground">
                  Balance: {getFromTokenBalance().toFixed(6)} {fromToken.symbol}
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <Select
                value={fromToken?.address || ""}
                onValueChange={(value) => {
                  const token = tokens.find((t) => t.address === value);
                  setFromToken(token || null);
                  setFromTokenSearch(""); // Clear search when token is selected
                }}
              >
                <SelectTrigger className="flex-1 h-12">
                  <SelectValue placeholder="Select token">
                    {fromToken && (
                      <div className="flex items-center gap-3">
                        {fromToken.logoURI && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={fromToken.logoURI}
                            alt={fromToken.symbol}
                            className="w-6 h-6 rounded-full"
                          />
                        )}
                        <span className="font-medium">{fromToken.symbol}</span>
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2">
                    <Input
                      placeholder="Search tokens..."
                      value={fromTokenSearch}
                      onChange={(e) => setFromTokenSearch(e.target.value)}
                      className="mb-2"
                    />
                  </div>
                  {filteredFromTokens.map((token) => (
                    <SelectItem key={token.address} value={token.address}>
                      <div className="flex items-center gap-2">
                        {token.logoURI && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={token.logoURI}
                            alt={token.symbol}
                            className="w-4 h-4"
                          />
                        )}
                        <div>
                          <div className="font-medium">{token.symbol}</div>
                          <div className="text-xs text-muted-foreground">
                            {token.name}
                          </div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                  {filteredFromTokens.length === 0 && (
                    <div className="p-2 text-sm text-muted-foreground text-center">
                      No tokens found
                    </div>
                  )}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input
                  id="from-amount"
                  type="number"
                  placeholder="0.0"
                  value={fromAmount}
                  onChange={(e) => setFromAmount(e.target.value)}
                  className="w-32 h-12 text-right font-medium"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleMaxClick}
                  disabled={!fromToken || getFromTokenBalance() === 0}
                  className="h-12 px-3"
                >
                  Max
                </Button>
              </div>
            </div>
          </div>

          {/* Swap Button */}
          <div className="flex justify-center py-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSwapTokens}
              className="rounded-full w-12 h-12 p-0"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                />
              </svg>
            </Button>
          </div>

          {/* To Token */}
          <div className="space-y-3">
            <Label
              htmlFor="to-token"
              className="text-sm font-medium text-muted-foreground"
            >
              To
            </Label>
            <div className="flex gap-3">
              <Select
                value={toToken?.address || ""}
                onValueChange={(value) => {
                  const token = tokens.find((t) => t.address === value);
                  setToToken(token || null);
                  setToTokenSearch(""); // Clear search when token is selected
                }}
              >
                <SelectTrigger className="flex-1 h-12">
                  <SelectValue placeholder="Select token">
                    {toToken && (
                      <div className="flex items-center gap-3">
                        {toToken.logoURI && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={toToken.logoURI}
                            alt={toToken.symbol}
                            className="w-6 h-6 rounded-full"
                          />
                        )}
                        <span className="font-medium">{toToken.symbol}</span>
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2">
                    <Input
                      placeholder="Search tokens..."
                      value={toTokenSearch}
                      onChange={(e) => setToTokenSearch(e.target.value)}
                      className="mb-2"
                    />
                  </div>
                  {filteredToTokens.map((token) => (
                    <SelectItem key={token.address} value={token.address}>
                      <div className="flex items-center gap-2">
                        {token.logoURI && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={token.logoURI}
                            alt={token.symbol}
                            className="w-4 h-4"
                          />
                        )}
                        <div>
                          <div className="font-medium">{token.symbol}</div>
                          <div className="text-xs text-muted-foreground">
                            {token.name}
                          </div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                  {filteredToTokens.length === 0 && (
                    <div className="p-2 text-sm text-muted-foreground text-center">
                      No tokens found
                    </div>
                  )}
                </SelectContent>
              </Select>
              <Input
                id="to-amount"
                type="number"
                placeholder="0.0"
                value={toAmount}
                readOnly
                className="w-32 h-12 text-right font-medium text-muted-foreground"
              />
            </div>
          </div>

          {/* Quote Info */}
          {quote && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Price Impact</span>
                <span className="font-medium">
                  {parseFloat(quote.priceImpactPct).toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Slippage</span>
                <span className="font-medium">{quote.slippageBps / 100}%</span>
              </div>
              {isLoadingQuote && (
                <div className="text-center text-sm text-muted-foreground font-medium">
                  Updating quote...
                </div>
              )}
            </div>
          )}

          {/* Swap Button */}
          <Button
            onClick={executeSwap}
            disabled={
              !quote || isLoadingQuote || isSwapping || !fromAmount || !toAmount
            }
            className="w-full"
          >
            {isSwapping ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-muted border-t-foreground rounded-full animate-spin"></div>
                Swapping...
              </div>
            ) : isLoadingQuote ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-muted border-t-foreground rounded-full animate-spin"></div>
                Getting Quote...
              </div>
            ) : (
              "Swap Tokens"
            )}
          </Button>

          {/* User Info */}
          <div className="text-center pt-4 border-t border-muted/50">
            <div className="text-xs text-muted-foreground">
              Connected:{" "}
              <span className="font-mono text-primary">
                {walletAddress?.slice(0, 8)}...
                {walletAddress?.slice(-8)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
