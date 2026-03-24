import { Connection, VersionedTransaction } from "@solana/web3.js";
import { env } from "../env";
import { v4 as uuidv4 } from "uuid";
import bs58 from "bs58";
import * as Sentry from "@sentry/nextjs";
import { getChewingGlassExplorerUrl, getExplorerUrl } from "./explorer";
import { getCluster } from "../solana";
import {
  shouldUseJitoBundle,
  simulateJitoBundle,
  submitJitoBundle,
  JitoBundleContext,
} from "./jito";

function isBlockhashNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Blockhash not found") || message.includes("blockhash not found");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface TransactionBatchPayload {
  parallel: boolean;
  transactions: string[];
  tag?: string;
  payer?: string;
  transactionMetadata?: Array<Record<string, unknown> | undefined>;
}

export interface BatchSubmissionResult {
  batchId: string;
  submissionType: "single" | "parallel" | "sequential" | "jito_bundle";
  signatures?: string[];
  jitoBundleId?: string;
  error?: string;
}

// Submit single transaction
export async function submitSingleTransaction(
  connection: Connection,
  serializedTransaction: string,
): Promise<string> {
  let transaction: VersionedTransaction;
  try {
    transaction = VersionedTransaction.deserialize(
      Buffer.from(serializedTransaction, "base64"),
    );
  } catch (error) {
    // Capture deserialization error
    Sentry.captureException(error, {
      level: "error",
      tags: {
        error_type: "transaction_deserialization_failed",
      },
      extra: {
        error_message: error instanceof Error ? error.message : "Unknown error",
      },
    });
    throw error;
  }

  try {
    const signature = await connection.sendRawTransaction(
      transaction.serialize(),
      {
        skipPreflight: true,
      },
    );

    return signature;
  } catch (error) {
    // Capture submission error with explorer link
    const explorerUrl = getExplorerUrl(transaction);
    const chewingGlassExplorerUrl = getChewingGlassExplorerUrl(transaction);
    Sentry.captureException(error, {
      level: "error",
      tags: {
        error_type: "transaction_submission_failed",
        submission_type: "single",
      },
      extra: {
        error_message: error instanceof Error ? error.message : "Unknown error",
        explorer_link: explorerUrl,
        chewing_glass_explorer_link: chewingGlassExplorerUrl,
      },
      contexts: {
        transaction: {
          explorer_link: explorerUrl,
          chewing_glass_explorer_link: chewingGlassExplorerUrl,
          submission_type: "single",
        },
      },
    });
    throw error;
  }
}

// Submit transactions in parallel
export async function submitTransactionsParallel(
  connection: Connection,
  serializedTransactions: string[],
): Promise<string[]> {
  const submissions = serializedTransactions.map(async (serializedTx) => {
    return await submitSingleTransaction(connection, serializedTx);
  });

  return await Promise.all(submissions);
}

// Submit transactions sequentially
export async function submitTransactionsSequential(
  connection: Connection,
  serializedTransactions: string[],
): Promise<string[]> {
  const signatures: string[] = [];

  for (const serializedTx of serializedTransactions) {
    const signature = await submitSingleTransaction(connection, serializedTx);
    signatures.push(signature);
  }

  return signatures;
}

// Main submission function that handles all types
export async function submitTransactionBatch(
  payload: TransactionBatchPayload,
): Promise<BatchSubmissionResult> {
  const batchId = uuidv4();
  const connection = new Connection(env.SOLANA_RPC_URL);
  const cluster = getCluster();
  const bundleContext: JitoBundleContext = {
    tag: payload.tag,
    payer: payload.payer,
    transactionMetadata: payload.transactionMetadata,
  };

  const attempt = async (): Promise<BatchSubmissionResult> => {
    // Single transaction case
    if (payload.transactions.length === 1) {
      const signature = await submitSingleTransaction(
        connection,
        payload.transactions[0],
      );
      return {
        batchId,
        submissionType: "single",
        signatures: [signature],
      };
    }

    // Multiple transactions
    if (shouldUseJitoBundle(payload.transactions.length, cluster)) {
      // Mainnet: use Jito bundle
      await simulateJitoBundle(payload.transactions, bundleContext);

      const jitoBundleId = await submitJitoBundle(payload.transactions, bundleContext);
      return {
        batchId,
        submissionType: "jito_bundle",
        jitoBundleId,
        signatures: payload.transactions.map((tx) =>
          bs58.encode(
            VersionedTransaction.deserialize(Buffer.from(tx, "base64"))
              .signatures[0],
          ),
        ),
      };
    } else {
      // Devnet/Localnet: use parallel or sequential based on payload.parallel
      if (payload.parallel) {
        const signatures = await submitTransactionsParallel(
          connection,
          payload.transactions,
        );
        return {
          batchId,
          submissionType: "parallel",
          signatures,
        };
      } else {
        const signatures = await submitTransactionsSequential(
          connection,
          payload.transactions,
        );
        return {
          batchId,
          submissionType: "sequential",
          signatures,
        };
      }
    }
  };

  try {
    const MAX_BLOCKHASH_RETRIES = 5;
    let lastError: unknown;
    for (let i = 0; i <= MAX_BLOCKHASH_RETRIES; i++) {
      try {
        return await attempt();
      } catch (error) {
        if (isBlockhashNotFoundError(error) && i < MAX_BLOCKHASH_RETRIES) {
          console.warn(
            `[submitTransactionBatch] Blockhash not found, retrying after 2s (attempt ${i + 1}/${MAX_BLOCKHASH_RETRIES})...`,
          );
          await sleep(2000);
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  } catch (error) {
    // Capture batch submission error
    // Try to get explorer links for transactions if possible
    const explorerLinks: string[] = [];
    const chewingGlassExplorerLinks: string[] = [];
    try {
      for (const serializedTx of payload.transactions.slice(0, 3)) {
        // Limit to first 3 to avoid too much data
        const tx = VersionedTransaction.deserialize(
          Buffer.from(serializedTx, "base64"),
        );
        explorerLinks.push(getExplorerUrl(tx));
        chewingGlassExplorerLinks.push(getChewingGlassExplorerUrl(tx));
      }
    } catch {
      // Ignore errors when generating explorer links
    }

    Sentry.captureException(error, {
      level: "error",
      tags: {
        error_type: "transaction_batch_submission_failed",
        submission_type: "batch",
        cluster,
        tag: payload.tag,
      },
      extra: {
        error_message: error instanceof Error ? error.message : "Unknown error",
        batch_id: batchId,
        batch_size: payload.transactions.length,
        parallel: payload.parallel,
        cluster,
        tag: payload.tag,
        payer: payload.payer,
        transaction_metadata: payload.transactionMetadata,
        explorer_links: explorerLinks.length > 0 ? explorerLinks : undefined,
        chewing_glass_explorer_links: chewingGlassExplorerLinks.length > 0 ? chewingGlassExplorerLinks : undefined,
      },
      contexts: {
        transaction: {
          batch_id: batchId,
          batch_size: payload.transactions.length,
          parallel: payload.parallel,
          cluster,
          tag: payload.tag,
          payer: payload.payer,
          explorer_links: explorerLinks,
          chewing_glass_explorer_links: chewingGlassExplorerLinks,
        },
      },
    });

    return {
      batchId,
      submissionType: "single", // fallback
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
