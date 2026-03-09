"use client";

import { useTokenBalances } from "@/hooks/useTokenBalances";
import { Coins } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { TransferTokenModal } from "./TransferTokenModal";
import { SwapInterface } from "./SwapInterface";
import { useState } from "react";
import Image from "next/image";
import { TOKEN_MINTS } from "@/lib/constants/tokens";

interface TokenListProps {
  walletAddress: string;
}

export const TokenList = ({ walletAddress }: TokenListProps) => {
  const { data: tokenBalances, isLoading } = useTokenBalances(walletAddress);
  const [transferOpen, setTransferOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<
    | {
        mint?: string;
        symbol?: string;
        decimals?: number;
      }
    | undefined
  >();

  const formatUsdAmount = (amount: number) => {
    return amount.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatTokenAmount = (amount: number) => {
    // Always show decimal form, never scientific notation
    if (amount < 1) return amount.toFixed(8);
    if (amount < 1000) return amount.toFixed(4);
    return amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Holdings</h2>
        {!!tokenBalances && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSwapOpen(true)}
            >
              Swap
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setSelectedToken(undefined);
                setTransferOpen(true);
              }}
            >
              Transfer
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-1 p-2">
            <div className="w-8 h-8 border-2 border-zinc-600 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-muted-foreground">Loading tokens...</p>
          </CardContent>
        </Card>
      ) : !tokenBalances ||
        (!tokenBalances?.tokens?.length && tokenBalances.solBalance === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-1 p-2">
            <Coins className="w-10 h-10 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              No tokens found for this wallet
            </p>
            <p className="text-sm text-muted-foreground/50">
              Tokens associated with your wallet will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* SOL Balance */}
          <Card>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center">
                    <Image
                      src={`https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${TOKEN_MINTS.WSOL}/logo.png`}
                      alt="Solana"
                      width={32}
                      height={32}
                      className="w-full h-full"
                    />
                  </div>
                  <div>
                    <p className="font-medium">Solana</p>
                    <p className="text-sm text-muted-foreground">SOL</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">
                    {formatTokenAmount(tokenBalances.solBalance)} SOL
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Token Balances */}
          {tokenBalances.tokens.map((token) => (
            <Card key={token.mint}>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
                      {token.logoURI ? (
                        <Image
                          src={token.logoURI}
                          alt={token.name || token.symbol || "Token"}
                          width={32}
                          height={32}
                          className="w-full h-full"
                        />
                      ) : null}
                      {!token.logoURI && (
                        <div className="w-10 h-10 rounded-full text-white font-bold text-xs flex items-center justify-center">
                          <span className="w-full h-full rounded-full text-white font-bold text-xs flex items-center justify-center">
                            {token.symbol?.slice(0, 3).toUpperCase() || "?"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-medium">
                        {token.name || token.symbol}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {token.symbol}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {typeof token.balanceUsd !== "undefined" &&
                    token.balanceUsd !== null ? (
                      <p className="font-medium">
                        {formatUsdAmount(token.balanceUsd)}
                      </p>
                    ) : (
                      <p className="font-medium">Price unavailable</p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {formatTokenAmount(token.uiAmount)} {token.symbol}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <TransferTokenModal
        open={transferOpen}
        onOpenChange={setTransferOpen}
        walletAddress={walletAddress}
        token={selectedToken}
        tokens={[
          { symbol: "SOL", uiAmount: tokenBalances?.solBalance },
          ...(tokenBalances?.tokens || []).map((t) => ({
            mint: t.mint,
            symbol: t.symbol,
            decimals: t.decimals,
            uiAmount: t.uiAmount,
          })),
        ]}
      />
      {swapOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-semibold">Token Swap</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSwapOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </Button>
            </div>
            <div className="p-6">
              <SwapInterface />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
