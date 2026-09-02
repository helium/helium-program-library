import { Connection } from "@solana/web3.js";
import { env } from "../env";
import { jitoBlockEngineRequest } from "./jito";
import PendingTransaction, {
  TransactionStatus,
} from "../models/pending-transaction";
import TransactionBatch, { BatchStatus } from "../models/transaction-batch";
import { sequelize } from "../db";
import { readBatchStatus } from "./batch-status-read";

export interface TransactionStatusResult {
  signature: string;
  status: TransactionStatus;
}

export interface BatchStatusResult {
  batchStatus: BatchStatus;
  confirmedCount: number;
  failedCount: number;
  transactionStatuses: TransactionStatusResult[];
  jitoBundleStatus?: any;
  /**
   * The cluster could not be read, so nothing was decided or written and the
   * statuses below are the stored ones. Callers must not act on them.
   */
  skipped?: boolean;
}

/**
 * Check Jito bundle status
 */
export async function checkJitoBundleStatus(
  batch: TransactionBatch,
): Promise<{ status: BatchStatus; jitoBundleStatus?: any }> {
  let batchStatus: BatchStatus = "pending";
  let jitoBundleStatus = null;

  if (batch.submissionType === "jito_bundle" && batch.jitoBundleId) {
    try {
      const response = await jitoBlockEngineRequest(
        "getInflightBundleStatuses",
        [[batch.jitoBundleId]],
      );

      if (response.ok) {
        const result = await response.json();
        if (
          result.result &&
          result.result.value &&
          result.result.value.length > 0
        ) {
          jitoBundleStatus = result.result.value[0];

          if (jitoBundleStatus.status === "Failed") {
            batchStatus = "failed";
          } else if (jitoBundleStatus.status === "Landed") {
            batchStatus = "confirmed";
          }
        }
      }
    } catch (error) {
      console.error("Failed to check Jito bundle status:", error);
    }
  }

  return { status: batchStatus, jitoBundleStatus };
}

/**
 * Check the status of all transactions in a batch and update database
 */
export async function checkAndUpdateBatchStatus(
  batch: TransactionBatch,
  commitment: "confirmed" | "finalized" = "confirmed",
): Promise<BatchStatusResult> {
  const connection = new Connection(env.SOLANA_RPC_URL);

  // Every row of the batch, not just the still-pending ones a caller happened
  // to load: the batch rollup below is over the whole batch, so a batch whose
  // other transactions already confirmed rolls up to "partial", not "failed".
  const transactions = await PendingTransaction.findAll({
    where: { batchId: batch.id },
  });

  // Check Jito bundle status first
  const jitoResult = await checkJitoBundleStatus(batch);
  const jitoBundleStatus = jitoResult.jitoBundleStatus;

  const decision = await readBatchStatus({
    rpc: connection,
    batchId: batch.id,
    transactions,
    commitment,
    jitoBatchStatus: jitoResult.status,
  });

  // The cluster could not be read. Leave the batch exactly as it is and report
  // the stored state: a resubmission attempt or an expiry decided from a failed
  // read would be decided from no information at all.
  if (!decision) {
    return {
      batchStatus: batch.status,
      confirmedCount: transactions.filter((tx) => tx.status === "confirmed")
        .length,
      failedCount: transactions.filter(
        (tx) => tx.status === "failed" || tx.status === "expired",
      ).length,
      transactionStatuses: transactions.map((tx) => ({
        signature: tx.signature,
        status: tx.status,
      })),
      jitoBundleStatus,
      skipped: true,
    };
  }

  const { transactionStatuses, confirmedCount, failedCount, batchStatus } =
    decision;

  // Every network read is done. Only now open the database transaction, and
  // write through it one statement at a time: a single pooled connection
  // cannot serve concurrent queries, and a failed read inside an open
  // transaction leaves it aborted for every statement that follows.
  const dbTransaction = await sequelize.transaction();
  let confirmedSignatures: string[];

  try {
    // Persist the rows whose status moved, and remember which ones just landed
    // so the indexers are told exactly once.
    const newlyConfirmed: string[] = [];
    for (const [i, pendingTx] of transactions.entries()) {
      const status = transactionStatuses[i].status;
      if (status === pendingTx.status) {
        continue;
      }
      if (status === "confirmed") {
        newlyConfirmed.push(pendingTx.signature);
        pendingTx.serializedTransaction = undefined;
      }
      pendingTx.status = status;
      await pendingTx.save({ transaction: dbTransaction });
    }

    // Update batch status in database
    const isTerminal =
      batchStatus === "confirmed" ||
      batchStatus === "failed" ||
      batchStatus === "partial";
    if (batchStatus !== batch.status) {
      batch.status = batchStatus;
      if (isTerminal && !batch.confirmedAt) {
        batch.confirmedAt = new Date();
      }
      await batch.save({ transaction: dbTransaction });
    }

    // Commit the transaction
    await dbTransaction.commit();

    confirmedSignatures = newlyConfirmed;
  } catch (error) {
    // Rollback the transaction on any error
    try {
      await dbTransaction.rollback();
    } catch (rollbackError) {
      // If rollback fails, log it but don't throw - the transaction is already aborted
      console.error("Error during transaction rollback:", rollbackError);
    }
    console.error("Failed to update database:", error);
    throw error;
  }

  // Notify indexers for confirmed transactions AFTER committing the transaction
  // This prevents indexer errors from aborting the database transaction
  for (const signature of confirmedSignatures) {
    try {
      await notifyIndexers(signature);
    } catch (error) {
      // Log but don't throw - indexer notification is not critical
      console.error(
        `Error notifying indexers for transaction ${signature}:`,
        error,
      );
    }
  }

  return {
    batchStatus,
    confirmedCount,
    failedCount,
    transactionStatuses,
    jitoBundleStatus,
  };
}

/**
 * Notify indexers about confirmed transactions
 */
async function notifyIndexers(signature: string): Promise<void> {
  // Account indexer notification
  if (env.ACCOUNT_INDEXER_URL && env.ACCOUNT_INDEXER_PASSWORD) {
    try {
      await fetch(`${env.ACCOUNT_INDEXER_URL}/process-transaction`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signature,
          password: env.ACCOUNT_INDEXER_PASSWORD,
        }),
      });
    } catch (error) {
      console.error("Error notifying account indexer:", error);
    }
  }

  // Asset owner indexer notification
  if (env.ASSET_OWNER_INDEXER_URL && env.ASSET_OWNER_INDEXER_PASSWORD) {
    try {
      await fetch(`${env.ASSET_OWNER_INDEXER_URL}/process-transaction`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signature,
          password: env.ASSET_OWNER_INDEXER_PASSWORD,
        }),
      });
    } catch (error) {
      console.error("Error notifying asset owner indexer:", error);
    }
  }
}
