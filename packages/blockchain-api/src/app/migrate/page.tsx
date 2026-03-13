"use client";

import { usePrivy, useSolanaWallets } from "@privy-io/react-auth";
import { useSignTransaction } from "@privy-io/react-auth/solana";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAsyncCallback } from "react-async-hook";
import {
  Cluster,
  clusterApiUrl,
  Connection,
  VersionedTransaction,
} from "@solana/web3.js";
import { client } from "@/lib/orpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Navbar } from "@/components/layout/Navbar";
import { ConnectWalletButton } from "@/components/auth/ConnectWalletButton";
import { useWalletAddress } from "@/hooks/useWalletAddress";

type Step =
  | "check"
  | "redirect"
  | "link-email"
  | "create-wallet"
  | "select-assets"
  | "confirm"
  | "success";

interface HotspotItem {
  address: string;
  name: string;
  type: string;
  deviceType?: string;
  splitWallets?: string[];
  inWelcomePack?: boolean;
}

interface TokenBalance {
  mint: string;
  symbol: string;
  balance: string; // raw amount in smallest unit (lamports, etc.)
  decimals: number;
}

/** Convert raw amount string (e.g. "2039280") to human-readable (e.g. "0.00203928") */
function rawToHuman(raw: string, decimals: number): string {
  if (decimals === 0) return raw;
  const padded = raw.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const frac = padded.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

/** Convert human-readable string (e.g. "0.00203928") to raw amount string (e.g. "2039280") */
function humanToRaw(amount: string, decimals: number): string {
  const [whole = "0", frac = ""] = amount.split(".");
  const paddedFrac = frac.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole + paddedFrac).toString();
}

export default function MigratePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <MigratePageContent />
    </Suspense>
  );
}

function MigratePageContent() {
  const { ready, authenticated, user, linkEmail, unlinkWallet } = usePrivy();
  const { wallets, createWallet } = useSolanaWallets();
  const { signTransaction: signTransactionEmbedded } = useSignTransaction();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reverse = searchParams.get("reverse") === "true";

  const [step, setStep] = useState<Step>("check");
  const [embeddedSolanaWalletAddress, setEmbeddedWalletAddress] = useState<
    string | null
  >(null);
  const [hotspots, setHotspots] = useState<HotspotItem[]>([]);
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [selectedHotspots, setSelectedHotspots] = useState<Set<string>>(
    new Set(),
  );
  const [tokenAmounts, setTokenAmounts] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [batchNum, setBatchNum] = useState(0);

  const effectiveWalletAddress = useWalletAddress();
  const heliumWorldUrl =
    process.env.NEXT_PUBLIC_WORLD_HELIUM_URL || "https://world.helium.com";

  // Get wallets
  const externalWallet = wallets.find((w) => w.walletClientType !== "privy");
  const externalWalletAddress =
    effectiveWalletAddress || externalWallet?.address || user?.wallet?.address;

  // ?reverse=true swaps direction: embedded → external (for testing)
  const sourceWallet = reverse
    ? embeddedSolanaWalletAddress
    : externalWalletAddress;
  const destinationWallet = reverse
    ? externalWalletAddress
    : embeddedSolanaWalletAddress;

  // Check if user has an embedded Solana wallet (check linkedAccounts since
  // useSolanaWallets only returns actively connected wallets)
  const embeddedSolanaWallet = user?.linkedAccounts?.find(
    (a: any) =>
      a.type === "wallet" &&
      a.walletClientType === "privy" &&
      a.chainType === "solana",
  ) as { address: string } | undefined;

  // Step "check": detect wallet type and route to next step
  useEffect(() => {
    if (!ready || !authenticated || step !== "check" || wallets.length === 0)
      return;

    if (!externalWallet && !reverse) {
      // Embedded wallet user: show redirect step
      setStep("redirect");
      return;
    }

    if (!user?.email) {
      setStep("link-email");
    } else if (embeddedSolanaWallet) {
      setEmbeddedWalletAddress(embeddedSolanaWallet.address);
      setStep("select-assets");
    } else {
      setStep("create-wallet");
    }
  }, [
    ready,
    authenticated,
    user,
    step,
    embeddedSolanaWallet,
    heliumWorldUrl,
    externalWallet,
    wallets.length,
    reverse,
  ]);

  // After email is linked, advance from link-email step
  useEffect(() => {
    if (step !== "link-email" || !user?.email) return;

    if (embeddedSolanaWallet) {
      setEmbeddedWalletAddress(embeddedSolanaWallet.address);
      setStep("select-assets");
    } else {
      setStep("create-wallet");
    }
  }, [step, user?.email, embeddedSolanaWallet]);

  // Create embedded wallet (only callable once email is linked)
  const { execute: handleCreateWallet, loading: creatingWallet } =
    useAsyncCallback(
      async () => {
        const wallet = await createWallet();
        setEmbeddedWalletAddress(wallet.address);
        setStep("select-assets");
      },
      {
        onError: (e) => {
          console.error("Create wallet error:", e);
          setError(e.message);
        },
      },
    );

  // Load assets
  const { execute: loadAssets, loading: loadingAssets } = useAsyncCallback(
    async () => {
      if (!sourceWallet) return;

      const [hotspotsData, balancesData] = await Promise.all([
        client.migration.getHotspots({ walletAddress: sourceWallet }),
        client.tokens.getBalances({ walletAddress: sourceWallet }),
      ]);

      setHotspots(
        hotspotsData.hotspots.map((h) => ({
          address: h.entityKey,
          name: h.name,
          type: h.type,
          deviceType: h.deviceType,
          splitWallets: h.splitWallets,
          inWelcomePack: h.inWelcomePack,
        })),
      );

      const tokens: TokenBalance[] = [];
      if (balancesData.solBalance > 0) {
        tokens.push({
          mint: "So11111111111111111111111111111111111111112",
          symbol: "SOL",
          balance: Math.round(balancesData.solBalance * 1e9).toString(),
          decimals: 9,
        });
      }
      for (const token of balancesData.tokens) {
        if (BigInt(token.balance) > BigInt(0)) {
          tokens.push({
            mint: token.mint,
            symbol: token.symbol || token.mint.slice(0, 4),
            balance: token.balance,
            decimals: token.decimals,
          });
        }
      }
      setTokenBalances(tokens);
    },
    {
      onError: (e) => {
        console.error("Load assets error:", e);
        setError(e.message);
      },
    },
  );

  // Load assets when entering select-assets step
  useEffect(() => {
    if (step === "select-assets" && sourceWallet) {
      loadAssets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sourceWallet]);

  // Toggle hotspot selection
  const toggleHotspot = (address: string) => {
    setSelectedHotspots((prev) => {
      const next = new Set(prev);
      if (next.has(address)) {
        next.delete(address);
      } else {
        next.add(address);
      }
      return next;
    });
  };

  const toggleAllHotspots = () => {
    if (selectedHotspots.size === hotspots.length) {
      setSelectedHotspots(new Set());
    } else {
      setSelectedHotspots(new Set(hotspots.map((h) => h.address)));
    }
  };

  const setMaxToken = (mint: string) => {
    const token = tokenBalances.find((t) => t.mint === mint);
    if (token) {
      setTokenAmounts((prev) => ({
        ...prev,
        [mint]: rawToHuman(token.balance, token.decimals),
      }));
    }
  };

  // Submit migration (loops when hasMore is true)
  const { execute: handleMigrate, loading: migrating } = useAsyncCallback(
    async () => {
      if (!sourceWallet || !destinationWallet) {
        throw new Error("Wallets not configured");
      }

      setError(null);
      setBatchNum(0);

      // Build token list — convert human-readable amounts to raw via BigInt
      const tokensToMigrate = Object.entries(tokenAmounts)
        .filter(([, amount]) => amount && parseFloat(amount) > 0)
        .map(([mint, amount]) => {
          const token = tokenBalances.find((t) => t.mint === mint);
          const decimals = token?.decimals ?? 0;
          return { mint, amount: humanToRaw(amount, decimals) };
        });

      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_URL ||
          clusterApiUrl(
            (process.env.NEXT_PUBLIC_SOLANA_CLUSTER as Cluster) ||
              "mainnet-beta",
          ),
      );

      let currentBatch = 0;
      let params: {
        sourceWallet: string;
        destinationWallet: string;
        hotspots: string[];
        tokens: { mint: string; amount: string }[];
      } = {
        sourceWallet,
        destinationWallet,
        hotspots: Array.from(selectedHotspots),
        tokens: tokensToMigrate,
      };

      while (true) {
        currentBatch++;
        setBatchNum(currentBatch);

        const result = await client.migration.migrate(params);

        if (result.warnings?.length) {
          setWarnings(result.warnings);
        }

        // Nothing left to do
        if (result.transactionData.transactions.length === 0) {
          break;
        }

        // Custom signing flow: sign each tx with appropriate wallets
        const signedTransactions: {
          serializedTransaction: string;
          metadata?: any;
        }[] = [];

        for (const txItem of result.transactionData.transactions) {
          let tx = VersionedTransaction.deserialize(
            Buffer.from(txItem.serializedTransaction, "base64"),
          );

          // Check the actual transaction message for required signers
          // instead of trusting metadata, since batching may split
          // instructions across transactions differently than expected
          const numRequired = tx.message.header.numRequiredSignatures;
          const requiredSignerKeys = tx.message.staticAccountKeys
            .slice(0, numRequired)
            .map((k) => k.toBase58());

          // Sign with source (external) wallet if it's actually a required signer
          if (
            externalWallet?.signTransaction &&
            externalWallet.address &&
            requiredSignerKeys.includes(externalWallet.address)
          ) {
            tx = await externalWallet.signTransaction(tx);
          }

          // Sign with destination (embedded) wallet if it's actually a required signer
          if (
            embeddedSolanaWalletAddress &&
            requiredSignerKeys.includes(embeddedSolanaWalletAddress)
          ) {
            tx = (await signTransactionEmbedded({
              transaction: tx,
              connection,
            })) as VersionedTransaction;
          }

          signedTransactions.push({
            serializedTransaction: Buffer.from(tx.serialize()).toString(
              "base64",
            ),
            metadata: txItem.metadata,
          });
        }

        // Submit all signed transactions
        const { batchId } = await client.transactions.submit({
          transactions: signedTransactions,
          parallel: result.transactionData.parallel,
          tag: result.transactionData.tag,
        });

        // Poll for confirmation
        const MAX_POLLS = 60;
        const POLL_INTERVAL = 2000;
        let confirmed = false;
        for (let i = 0; i < MAX_POLLS; i++) {
          const batch = await client.transactions.get({
            id: batchId,
            commitment: "confirmed",
          });

          if (batch.status === "confirmed") {
            confirmed = true;
            break;
          }
          if (batch.status === "failed" || batch.status === "expired") {
            const failedTxs = batch.transactions
              .filter((t) => t.status === "failed" || t.status === "expired")
              .map((t) => t.signature)
              .join(", ");
            throw new Error(
              `Migration transactions ${batch.status}: ${failedTxs}`,
            );
          }
          if (batch.status === "partial") {
            setError(
              "Some migration transactions failed. Review what still needs to be migrated below.",
            );
            setSelectedHotspots(new Set());
            setTokenAmounts({});
            setStep("select-assets");
            return;
          }

          await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        }

        if (!confirmed) {
          throw new Error(
            "Migration transactions timed out waiting for confirmation",
          );
        }

        // Check if more work remains — use nextParams for the next call
        if (!result.nextParams) break;
        params = result.nextParams;
      }

      setBatchNum(0);
      setStep("success");

      // Remove external wallet after migration.
      // Unlink from Privy account if linked, then disconnect from session.
      if (!reverse && externalWallet?.address) {
        const isLinked = user?.linkedAccounts?.some(
          (a: any) =>
            a.type === "wallet" && a.address === externalWallet.address,
        );
        if (isLinked) {
          await unlinkWallet(externalWallet.address).catch((e) =>
            console.warn(
              "Failed to unlink wallet (migration still succeeded):",
              e,
            ),
          );
        }
        if (externalWallet.disconnect) {
          externalWallet.disconnect();
        }
      }
    },
    {
      onError: (e) => {
        console.error("Migration error:", e);
        setBatchNum(0);
        const msg = e.message || String(e);
        if (
          msg.includes("WalletSignTransactionError") ||
          msg.includes("Unexpected error")
        ) {
          setError(
            "Wallet failed to sign the transaction. Make sure your wallet is connected and set to the correct network (e.g., devnet for testing).",
          );
        } else {
          setError(msg);
        }
      },
    },
  );

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <Navbar showNav={false} />
        <div className="flex items-center justify-center pt-24">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle>Sign In Required</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Please sign in to migrate your account.
              </p>
              <ConnectWalletButton className="w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Navbar showNav={false} />
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Migrate to Helium World</h1>
            <p className="text-muted-foreground">
              Move your assets to world.helium.com
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
              {error}
            </div>
          )}

          {step === "check" && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  Detecting wallet type...
                </p>
              </CardContent>
            </Card>
          )}

          {step === "redirect" && (
            <Card>
              <CardHeader>
                <CardTitle>Beta Has Ended</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  The My Helium beta has ended. We&apos;re migrating all
                  accounts to Helium World. Since you&apos;re already using an
                  embedded wallet, your account is ready to go.
                </p>
                <Button
                  onClick={() => {
                    window.location.href = heliumWorldUrl;
                  }}
                  className="w-full"
                >
                  Continue to Helium World
                </Button>
              </CardContent>
            </Card>
          )}

          {step === "link-email" && (
            <Card>
              <CardHeader>
                <CardTitle>Link Your Email</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  To migrate, you need an email address linked to your account.
                </p>
                <Button onClick={linkEmail} className="w-full">
                  Link Email
                </Button>
              </CardContent>
            </Card>
          )}

          {step === "create-wallet" && (
            <Card>
              <CardHeader>
                <CardTitle>Create Embedded Wallet</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  To migrate, you need an embedded wallet. We&apos;ll create one
                  linked to your email address.
                </p>
                {!user?.email ? (
                  <Button onClick={linkEmail} className="w-full">
                    Link Email
                  </Button>
                ) : (
                  <Button
                    onClick={handleCreateWallet}
                    disabled={creatingWallet}
                    className="w-full"
                  >
                    {creatingWallet ? "Creating wallet..." : "Create Wallet"}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {step === "select-assets" && (
            <div className="space-y-6">
              {destinationWallet && (
                <Card>
                  <CardContent className="py-4">
                    <p className="text-sm text-muted-foreground">
                      Destination wallet:
                    </p>
                    <p className="font-mono text-sm break-all">
                      {destinationWallet}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Warnings */}
              {hotspots.some((h) => h.splitWallets?.length) && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-700 dark:text-yellow-300 text-sm">
                  Split contracts will be removed and recreated with your new
                  wallet.
                </div>
              )}

              {/* Hotspots */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Hotspots</CardTitle>
                    {hotspots.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={toggleAllHotspots}
                      >
                        {selectedHotspots.size === hotspots.length
                          ? "Deselect All"
                          : "Select All"}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingAssets ? (
                    <p className="text-muted-foreground text-sm">
                      Loading hotspots...
                    </p>
                  ) : hotspots.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No hotspots found.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {hotspots.map((hotspot) => (
                        <label
                          key={hotspot.address}
                          className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50"
                        >
                          <input
                            type="checkbox"
                            checked={selectedHotspots.has(hotspot.address)}
                            onChange={() => toggleHotspot(hotspot.address)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {hotspot.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {hotspot.type}{" "}
                              {hotspot.deviceType
                                ? `- ${hotspot.deviceType}`
                                : ""}
                              {hotspot.splitWallets?.length
                                ? ` (splits to ${hotspot.splitWallets.map((w) => w.slice(0, 4) + "..." + w.slice(-4)).join(", ")})`
                                : ""}
                              {hotspot.inWelcomePack
                                ? " (in welcome pack)"
                                : ""}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tokens */}
              <Card>
                <CardHeader>
                  <CardTitle>Tokens</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingAssets ? (
                    <p className="text-muted-foreground text-sm">
                      Loading balances...
                    </p>
                  ) : tokenBalances.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No token balances found.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {tokenBalances.map((token) => (
                        <div key={token.mint} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">
                              {token.symbol} (Balance:{" "}
                              {rawToHuman(token.balance, token.decimals)})
                            </Label>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setMaxToken(token.mint)}
                            >
                              Max
                            </Button>
                          </div>
                          <Input
                            type="text"
                            placeholder="0"
                            value={tokenAmounts[token.mint] || ""}
                            onChange={(e) =>
                              setTokenAmounts((prev) => ({
                                ...prev,
                                [token.mint]: e.target.value,
                              }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Button
                onClick={() => setStep("confirm")}
                className="w-full"
                disabled={
                  selectedHotspots.size === 0 &&
                  Object.values(tokenAmounts).every(
                    (v) => !v || parseFloat(v || "0") === 0,
                  )
                }
              >
                Review Migration
              </Button>
            </div>
          )}

          {step === "confirm" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Confirm Migration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-1">
                      Source Wallet ({reverse ? "Embedded" : "External"})
                    </p>
                    <p className="font-mono text-xs break-all text-muted-foreground">
                      {sourceWallet}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-1">
                      Destination Wallet ({reverse ? "External" : "Embedded"})
                    </p>
                    <p className="font-mono text-xs break-all text-muted-foreground">
                      {destinationWallet}
                    </p>
                  </div>

                  {selectedHotspots.size > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-1">
                        Hotspots ({selectedHotspots.size})
                      </p>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {hotspots
                          .filter((h) => selectedHotspots.has(h.address))
                          .map((h) => (
                            <li key={h.address}>{h.name}</li>
                          ))}
                      </ul>
                    </div>
                  )}

                  {Object.entries(tokenAmounts).some(
                    ([, v]) => v && parseFloat(v || "0") > 0,
                  ) && (
                    <div>
                      <p className="text-sm font-medium mb-1">Tokens</p>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {Object.entries(tokenAmounts)
                          .filter(([, v]) => v && parseFloat(v || "0") > 0)
                          .map(([mint, amount]) => {
                            const token = tokenBalances.find(
                              (t) => t.mint === mint,
                            );
                            return (
                              <li key={mint}>
                                {token?.symbol}: {amount}
                              </li>
                            );
                          })}
                      </ul>
                    </div>
                  )}

                  {warnings.length > 0 && (
                    <div className="space-y-2">
                      {warnings.map((w, i) => (
                        <div
                          key={i}
                          className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded text-yellow-700 dark:text-yellow-300 text-sm"
                        >
                          {w}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep("select-assets")}
                  disabled={migrating}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleMigrate}
                  disabled={migrating}
                  className="flex-1"
                >
                  {migrating
                    ? batchNum > 1
                      ? `Migrating... (batch ${batchNum})`
                      : "Migrating..."
                    : "Confirm & Migrate"}
                </Button>
              </div>
            </div>
          )}

          {step === "success" && (
            <Card>
              <CardContent className="py-12 text-center space-y-4">
                <h2 className="text-2xl font-bold text-green-600">
                  Migration Complete
                </h2>
                <p className="text-muted-foreground">
                  Your assets have been successfully migrated.
                </p>
                {!reverse && (
                  <Button
                    onClick={() => {
                      window.location.href = heliumWorldUrl;
                    }}
                    className="mt-4"
                  >
                    Go to Helium World
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
