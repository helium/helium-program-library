"use client";

import { usePrivy, useSolanaWallets } from "@privy-io/react-auth";
import {
  Cluster,
  clusterApiUrl,
  Connection,
  VersionedTransaction,
} from "@solana/web3.js";
import { toast } from "sonner";
import { useSignTransaction } from "@privy-io/react-auth/solana";
import { useTransactionContext } from "@/providers/TransactionProvider";
import { useAsyncCallback } from "react-async-hook";
import { client } from "@/lib/orpc";

interface TransactionMetadata {
  type: string;
  description: string;
  [key: string]: unknown;
}

interface TransactionSubmissionOptions {
  parallel?: boolean;
  onSubmitted?: (batchId: string) => void;
  onSuccess?: (batchId: string, signatures: string[]) => void;
  onError?: (error: Error) => void;
}

class SimulationError extends Error {
  constructor(error: string, logs?: string[], link?: string) {
    super(error);
    this.logs = logs;
    this.link = link;
  }

  logs?: string[];
  link?: string;
}

const renderSimulationError = (error: SimulationError) => {
  const toastContent = (
    <div className="w-full max-w-xl">
      <div className="flex justify-between items-start gap-3">
        <div className="text-sm font-medium text-red-200">{error.message}</div>
        <button
          onClick={() => toast.dismiss()}
          className="text-gray-400 hover:text-white shrink-0"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      {error.logs && error.logs.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-blue-300 hover:text-blue-200 flex items-center select-none">
            <span className="transform transition-transform duration-200 group-open:rotate-90 mr-1.5">
              ▶
            </span>
            View Transaction Logs
          </summary>
          <div className="mt-2 bg-black/50 rounded border border-white/5">
            <div className="flex items-center justify-between px-2 py-1 border-b border-white/5">
              <span className="text-gray-400">Transaction Logs</span>
              <button
                onClick={() => {
                  const text = error.logs?.join("\n") || "";
                  navigator.clipboard.writeText(text);
                  toast.success("Copied to clipboard", { duration: 2000 });
                }}
                className="text-blue-300 hover:text-blue-200 px-2 py-0.5"
              >
                Copy
              </button>
            </div>
            <div className="max-h-[160px] overflow-y-auto custom-scrollbar p-2">
              <pre className="font-mono text-gray-300 whitespace-pre-wrap break-words">
                {error.logs.join("\n")}
              </pre>
            </div>
          </div>
        </details>
      )}
      {error.link && (
        <a
          href={error.link}
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-2 text-xs text-blue-300 hover:text-blue-200"
        >
          View in Explorer →
        </a>
      )}
    </div>
  );

  // Add custom scrollbar styles to the document if not already present
  if (!document.getElementById("custom-scrollbar-style")) {
    const style = document.createElement("style");
    style.id = "custom-scrollbar-style";
    style.textContent = `
      .custom-scrollbar::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
      }
      .custom-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
      }
      .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.2);
      }
      [data-sonner-toast][data-expanded="true"] {
        height: auto !important;
        min-height: var(--initial-height) !important;
      }
      [data-sonner-toast][data-expanded="true"] [data-content] {
        height: auto !important;
        transform: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  // Dismiss any existing toasts first
  toast.dismiss();

  return toast.error(toastContent, {
    duration: Infinity,
    style: {
      background: "#1E293B",
      color: "white",
      borderColor: "rgb(239 68 68 / 0.2)",
      borderWidth: "1px",
      padding: "0.5rem",
      maxWidth: "32rem",
      width: "100%",
      fontSize: "0.875rem",
      zIndex: 9999,
      pointerEvents: "auto",
    },
  });
};

export function useTransactionSubmission() {
  const { user, connectWallet } = usePrivy();
  const { wallets } = useSolanaWallets();
  const { signTransaction: signTransactionEmbedded } = useSignTransaction();
  const { addTransaction, registerSuccessCallback } = useTransactionContext();

  const signTransaction =
    user?.wallet?.connectorType === "embedded"
      ? (tx: VersionedTransaction) =>
          signTransactionEmbedded({
            transaction: tx,
            connection: new Connection(
              process.env.NEXT_PUBLIC_SOLANA_URL
                ? process.env.NEXT_PUBLIC_SOLANA_URL
                : clusterApiUrl(
                    process.env.NEXT_PUBLIC_SOLANA_CLUSTER as Cluster,
                  ),
            ),
          })
      : wallets.find((wallet) => wallet.address == user?.wallet?.address)
          ?.signTransaction;

  const submitTransactionBatch = useAsyncCallback(
    async (
      transactions: Array<{
        serializedTransaction: string;
        metadata?: TransactionMetadata;
      }>,
      parallel: boolean,
      tag?: string,
    ): Promise<string> => {
      if (!user?.wallet) {
        throw new Error("Wallet not connected");
      }

      if (!signTransaction) {
        connectWallet({
          description: "Connect your wallet to submit transactions",
          // @ts-ignore
          walletList: ["detected_solana_wallets"],
        });
        throw new Error("Wallet not connected");
      }

      // Sign all transactions
      const signedTransactions = [];
      for (const txData of transactions) {
        const transaction = VersionedTransaction.deserialize(
          Buffer.from(txData.serializedTransaction, "base64"),
        );
        const signedTx = await signTransaction(transaction);
        signedTransactions.push({
          serializedTransaction: Buffer.from(signedTx.serialize()).toString(
            "base64",
          ),
          metadata: txData.metadata,
        });
      }

      try {
        const result = await client.transactions.submit({
          transactions: signedTransactions,
          parallel,
          tag,
        });

        // If this was a duplicate submission, show info message
        if (result.message) {
          toast.info(result.message, { duration: 3000 });
        }

        return result.batchId;
      } catch (error: unknown) {
        // Handle ORPC errors
        const err = error as {
          data?: { logs?: string[]; link?: string };
          message?: string;
        };
        if (err.data?.logs) {
          throw new SimulationError(
            err.message || "Simulation failed",
            err.data.logs,
            err.data.link,
          );
        }
        throw error;
      }
    },
  );

  const submitTransactions = useAsyncCallback(
    async (
      transactionData: {
        transactions: {
          serializedTransaction: string;
          metadata?: TransactionMetadata;
        }[];
        parallel: boolean;
        tag?: string;
      },
      options: TransactionSubmissionOptions = {},
    ) => {
      if (!user?.wallet) {
        toast.error("Please connect your wallet first");
        throw new Error("Wallet not connected");
      }

      const { onSubmitted, onSuccess, onError } = options;
      const { transactions, parallel, tag } = transactionData;

      // Show initial loading state
      const toastId = toast.loading("Preparing transaction...");

      try {
        // Extract transactions with metadata
        const transactionsWithMetadata = transactions.map((tx) => ({
          serializedTransaction: tx.serializedTransaction,
          metadata: tx.metadata,
        }));

        // Submit as a batch
        const batchId = await submitTransactionBatch.execute(
          transactionsWithMetadata,
          parallel,
          tag,
        );

        // Dismiss the loading toast
        toast.dismiss(toastId);

        onSubmitted?.(batchId);

        // Store the onSuccess callback if provided
        if (onSuccess) {
          registerSuccessCallback(batchId, onSuccess);
        }

        // Add to persistent tracking if we have a tag
        if (tag) {
          const transactionMetadatas = transactions
            .map((tx) => tx.metadata)
            .filter((metadata): metadata is TransactionMetadata => !!metadata);

          if (transactionMetadatas.length > 0) {
            addTransaction({
              batchId,
              tag,
              type: transactionMetadatas[0].type, // Use first transaction type as primary
              description:
                transactionMetadatas.length === 1
                  ? transactionMetadatas[0].description
                  : `${transactionMetadatas.length} transactions in progress`,
              createdAt: new Date().toISOString(),
              status: "pending",
              transactionCount: transactionMetadatas.length,
              transactions: transactionMetadatas.map((metadata) => ({
                type: metadata.type,
                description: metadata.description,
              })),
            });
          }
        }

        return batchId;
      } catch (error: unknown) {
        toast.dismiss(toastId);

        console.error("Transaction submission error:", error);
        if (error instanceof SimulationError) {
          renderSimulationError(error);
        } else if (String(error).includes("WalletSignTransactionError")) {
          toast.error("Failed to sign transaction");
        } else {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          toast.error(errorMessage);
        }

        onError?.(
          error instanceof SimulationError ? error : new Error(String(error)),
        );

        throw error;
      }
    },
  );

  return {
    submitTransactions: submitTransactions.execute,
    isSubmitting: submitTransactions.loading,
  };
}
