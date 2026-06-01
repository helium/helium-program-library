import * as Sentry from "@sentry/nextjs";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { Op } from "sequelize";
import { sequelize } from "../db";
import { env } from "../env";
import { defineAssociations } from "../models/associations";
import PendingTransaction from "../models/pending-transaction";
import TransactionBatch from "../models/transaction-batch";
import { getChewingGlassExplorerUrl, getExplorerUrl } from "./explorer";
import { submitTransactionBatch } from "./transaction-submission";
import { checkAndUpdateBatchStatus } from "./transaction-status-checker";

// A batch that has been pending this long has either landed/failed on-chain
// (and will be resolved by the status check) or is a leaked reservation. Either
// way it must leave "pending" so the (tag, payer) submission lock is released.
// Comfortably longer than a blockhash lifetime (~60-90s).
const STALE_PENDING_BATCH_MS = 2 * 60 * 1000;

export interface ResubmissionResult {
  success: boolean;
  newSignatures?: string[];
  error?: string;
  batchId: string;
}

/**
 * Resubmit a single transaction that has expired or failed
 */
export async function resubmitSingleTransaction(
  pendingTx: PendingTransaction,
): Promise<ResubmissionResult> {
  if (!pendingTx.serializedTransaction) {
    return {
      success: false,
      error: "No serialized transaction available for resubmission",
      batchId: pendingTx.batchId || "",
    };
  }

  try {
    const connection = new Connection(env.SOLANA_RPC_URL);

    // Check if blockhash has expired
    if (pendingTx.lastValidBlockHeight) {
      const currentBlockHeight = await connection.getBlockHeight();
      if (currentBlockHeight > pendingTx.lastValidBlockHeight) {
        return {
          success: false,
          error: "Blockhash expired, cannot resubmit",
          batchId: pendingTx.batchId || "",
        };
      }
    } else {
      // No lastValidBlockHeight stored — assume expired for safety
      return {
        success: false,
        error: "Blockhash expired, cannot resubmit",
        batchId: pendingTx.batchId || "",
      };
    }

    // Deserialize and resubmit the transaction
    const transaction = VersionedTransaction.deserialize(
      Buffer.from(pendingTx.serializedTransaction, "base64"),
    );

    const signature = await connection.sendRawTransaction(
      transaction.serialize(),
      {
        skipPreflight: true,
      },
    );

    // Update the transaction record with new signature
    await pendingTx.update({
      signature,
      status: "pending",
    });

    return {
      success: true,
      newSignatures: [signature],
      batchId: pendingTx.batchId || "",
    };
  } catch (error) {
    console.error("Failed to resubmit single transaction:", error);

    // Capture resubmission error with explorer link if available
    let explorerUrl: string | undefined;
    let chewingGlassExplorerUrl: string | undefined;
    try {
      if (pendingTx.serializedTransaction) {
        const transaction = VersionedTransaction.deserialize(
          Buffer.from(pendingTx.serializedTransaction, "base64"),
        );
        explorerUrl = getExplorerUrl(transaction);
        chewingGlassExplorerUrl = getChewingGlassExplorerUrl(transaction);
      }
    } catch {
      // Ignore errors when generating explorer link
    }

    Sentry.captureException(error, {
      level: "error",
      tags: {
        error_type: "transaction_resubmission_failed",
        resubmission_type: "single",
      },
      extra: {
        error_message: error instanceof Error ? error.message : "Unknown error",
        batch_id: pendingTx.batchId,
        transaction_signature: pendingTx.signature,
        transaction_type: pendingTx.type,
        blockhash: pendingTx.blockhash,
        explorer_link: explorerUrl,
        chewing_glass_explorer_link: chewingGlassExplorerUrl,
      },
      contexts: {
        transaction: {
          batch_id: pendingTx.batchId,
          transaction_signature: pendingTx.signature,
          transaction_type: pendingTx.type,
          explorer_link: explorerUrl,
          chewing_glass_explorer_link: chewingGlassExplorerUrl,
        },
      },
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      batchId: pendingTx.batchId || "",
    };
  }
}

/**
 * Resubmit a batch of transactions using the existing submission logic
 * Note: Jito bundles should never be resubmitted - they either land or fail
 */
export async function resubmitTransactionBatch(
  batch: TransactionBatch,
  pendingTransactions: PendingTransaction[],
): Promise<ResubmissionResult> {
  if (pendingTransactions.length === 0) {
    return {
      success: false,
      error: "No transactions to resubmit",
      batchId: batch.id,
    };
  }

  // Jito bundles should never be resubmitted
  if (batch.submissionType === "jito_bundle") {
    return {
      success: false,
      error: "Jito bundles cannot be resubmitted - they either land or fail",
      batchId: batch.id,
    };
  }

  // Check if all transactions have serialized data
  const missingSerialized = pendingTransactions.filter(
    (tx) => !tx.serializedTransaction,
  );
  if (missingSerialized.length > 0) {
    return {
      success: false,
      error: `Missing serialized transactions for ${missingSerialized.length} transactions`,
      batchId: batch.id,
    };
  }

  try {
    // Prepare transactions for resubmission using existing submission logic
    const serializedTransactions = pendingTransactions.map(
      (tx) => tx.serializedTransaction!,
    );

    // Use the existing submission logic with the same parameters as the original batch
    const submissionResult = await submitTransactionBatch({
      transactions: serializedTransactions,
      parallel: batch.parallel,
    });

    // Update the pending transactions with new signatures
    const dbTransaction = await sequelize.transaction();

    try {
      // Update each transaction with its new signature
      for (let i = 0; i < pendingTransactions.length; i++) {
        const newSignature = submissionResult.signatures?.[i];
        if (newSignature) {
          await pendingTransactions[i].update(
            {
              signature: newSignature,
              status: "pending",
            },
            { transaction: dbTransaction },
          );
        }
      }

      // Update batch status (no Jito bundle ID since we're not using Jito for resubmission)
      await batch.update({ status: "pending" }, { transaction: dbTransaction });

      await dbTransaction.commit();

      return {
        success: true,
        newSignatures: submissionResult.signatures,
        batchId: batch.id,
      };
    } catch (error) {
      await dbTransaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Failed to resubmit transaction batch:", error);

    // Capture resubmission error with explorer links if available
    const explorerLinks: string[] = [];
    const chewingGlassExplorerLinks: string[] = [];
    try {
      for (const pendingTx of pendingTransactions.slice(0, 3)) {
        // Limit to first 3 to avoid too much data
        if (pendingTx.serializedTransaction) {
          const transaction = VersionedTransaction.deserialize(
            Buffer.from(pendingTx.serializedTransaction, "base64"),
          );
          explorerLinks.push(getExplorerUrl(transaction));
          chewingGlassExplorerLinks.push(
            getChewingGlassExplorerUrl(transaction),
          );
        }
      }
    } catch {
      // Ignore errors when generating explorer links
    }

    Sentry.captureException(error, {
      level: "error",
      tags: {
        error_type: "transaction_batch_resubmission_failed",
        resubmission_type: "batch",
        submission_type: batch.submissionType,
      },
      extra: {
        error_message: error instanceof Error ? error.message : "Unknown error",
        batch_id: batch.id,
        batch_size: pendingTransactions.length,
        parallel: batch.parallel,
        submission_type: batch.submissionType,
        cluster: batch.cluster,
        tag: batch.tag,
        explorer_links: explorerLinks.length > 0 ? explorerLinks : undefined,
        chewing_glass_explorer_links:
          chewingGlassExplorerLinks.length > 0
            ? chewingGlassExplorerLinks
            : undefined,
      },
      contexts: {
        transaction: {
          batch_id: batch.id,
          batch_size: pendingTransactions.length,
          parallel: batch.parallel,
          submission_type: batch.submissionType,
          explorer_links: explorerLinks,
          chewing_glass_explorer_links: chewingGlassExplorerLinks,
        },
      },
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      batchId: batch.id,
    };
  }
}

/**
 * Get all pending transactions that need resubmission
 * Excludes Jito bundles since they cannot be resubmitted
 */
export async function getPendingTransactionsForResubmission(): Promise<{
  batches: Array<{
    batch: TransactionBatch;
    transactions: PendingTransaction[];
  }>;
}> {
  // Ensure associations are defined before querying
  defineAssociations();

  const pendingBatches = await TransactionBatch.findAll({
    where: {
      status: "pending",
      submissionType: {
        [Op.ne]: "jito_bundle", // Exclude Jito bundles
      },
    },
    include: [
      {
        model: PendingTransaction,
        as: "transactions",
        where: {
          status: "pending",
        },
      },
    ],
  });

  const batches = pendingBatches.map((batch) => ({
    batch,
    transactions: batch.transactions || [],
  }));

  return { batches };
}

/**
 * Force a stale batch and its still-pending transactions to "expired" so the
 * partial unique index on (tag, payer) where status='pending' no longer blocks
 * new submissions for that tag.
 */
async function expirePendingBatch(batch: TransactionBatch): Promise<void> {
  const dbTransaction = await sequelize.transaction();
  try {
    await PendingTransaction.update(
      { status: "expired" },
      {
        where: { batchId: batch.id, status: "pending" },
        transaction: dbTransaction,
      },
    );
    batch.status = "expired";
    await batch.save({ transaction: dbTransaction });
    await dbTransaction.commit();
  } catch (error) {
    await dbTransaction.rollback();
    throw error;
  }
}

/**
 * Reap batches stuck in "pending" past STALE_PENDING_BATCH_MS.
 *
 * The tag-based submission lock keys off pending batches, and Jito batches are
 * never advanced by the resubmission loop (it excludes them) — they only resolve
 * when a client polls their status. A batch can therefore leak as pending if a
 * client stops polling, or if a submission crashes/rolls back after the batch
 * row was reserved. With deterministic tags (e.g. claim_rewards:<wallet>) a leak
 * would permanently block that tag, so this releases the lock.
 *
 * Includes Jito batches (unlike resubmission). Batches with real transactions get
 * one last on-chain/bundle status check that can resolve them to confirmed/failed;
 * anything still pending after that (including leaked reservations that never
 * recorded transactions) is expired.
 */
export async function reapStalePendingBatches(): Promise<void> {
  defineAssociations();

  const cutoff = new Date(Date.now() - STALE_PENDING_BATCH_MS);
  const staleBatches = await TransactionBatch.findAll({
    where: {
      status: "pending",
      updatedAt: { [Op.lt]: cutoff },
    },
    include: [
      {
        model: PendingTransaction,
        as: "transactions",
        required: false,
      },
    ],
  });

  for (const batch of staleBatches) {
    try {
      if ((batch.transactions ?? []).length > 0) {
        const result = await checkAndUpdateBatchStatus(batch, "confirmed");
        if (result.batchStatus !== "pending") {
          continue;
        }
      }
      await expirePendingBatch(batch);
    } catch (error) {
      console.error(`Error reaping stale batch ${batch.id}:`, error);
    }
  }
}
