import { Connection } from "@solana/web3.js";
import { env } from "../env";
import { jitoBlockEngineRequest } from "./jito";
import PendingTransaction, {
  TransactionStatus,
} from "../models/pending-transaction";
import TransactionBatch, { BatchStatus } from "../models/transaction-batch";
import { sequelize } from "../db";
import { readBatchStatus } from "./batch-status-read";
import { rollupBatchStatus, storedBatchStatus } from "./batch-status";

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
  clusterUnread?: boolean;
}

/**
 * Check Jito bundle status.
 *
 * A bundle Jito could not be reached for, or answered with an error for,
 * contributes no status of its own, so the cluster's view of the batch's
 * signatures decides on its own.
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

      if (!response.ok) {
        console.error(
          `Jito bundle status read failed for batch ${batch.id}: HTTP ${response.status}`,
        );
        return { status: batchStatus, jitoBundleStatus };
      }

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
    } catch (error) {
      console.error("Failed to check Jito bundle status:", error);
      return { status: batchStatus, jitoBundleStatus };
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
  const [transactions, jitoResult] = await Promise.all([
    PendingTransaction.findAll({ where: { batchId: batch.id } }),
    checkJitoBundleStatus(batch),
  ]);
  const jitoBundleStatus = jitoResult.jitoBundleStatus;

  const decision = await readBatchStatus({
    rpc: connection,
    batchId: batch.id,
    transactions,
    commitment,
    jitoBatchStatus: jitoResult.status,
  });

  // The cluster could not be read. Leave the batch exactly as it is
  // and report the stored state: a resubmission attempt or an expiry decided
  // from a failed read would be decided from no information at all.
  if (!decision) {
    return {
      ...storedBatchStatus(batch.status, transactions),
      jitoBundleStatus,
      clusterUnread: true,
    };
  }

  // Every network read is done. Only now open the database transaction, and
  // write through it one statement at a time: a single pooled connection
  // cannot serve concurrent queries, and a failed read inside an open
  // transaction leaves it aborted for every statement that follows.
  const dbTransaction = await sequelize.transaction();
  const newlyConfirmed: string[] = [];

  try {
    // Persist the rows whose status moved, and remember which ones just landed
    // so the indexers are told exactly once.
    for (const [i, pendingTx] of transactions.entries()) {
      const status = decision.transactionStatuses[i].status;
      if (status === pendingTx.status) {
        continue;
      }
      // The rows were read before the network round trips, so another replica
      // (or this batch's other poller) may have moved one since. Guarding on
      // the status the decision was made from makes the write a
      // compare-and-swap: a row that moved keeps whatever moved it, and the
      // indexers are told about a landing exactly once.
      const [updated] = await PendingTransaction.update(
        {
          status,
          ...(status === "confirmed" ? { serializedTransaction: null } : {}),
        },
        {
          where: { id: pendingTx.id, status: pendingTx.status },
          transaction: dbTransaction,
        },
      );
      if (updated === 0) {
        // Whatever moved the row is what the batch rolls up over below.
        await pendingTx.reload({ transaction: dbTransaction });
        continue;
      }
      if (status === "confirmed") {
        newlyConfirmed.push(pendingTx.signature);
        pendingTx.serializedTransaction = undefined;
      }
      pendingTx.status = status;
    }

    // The batch is rolled up from the row statuses that are now stored, not
    // from the decision: a row whose write lost the compare-and-swap above
    // carries the other writer's status, and the batch must agree with its
    // rows.
    const { batchStatus } = rollupBatchStatus(transactions, jitoResult.status);

    const isTerminal =
      batchStatus === "confirmed" ||
      batchStatus === "failed" ||
      batchStatus === "partial";
    if (batchStatus === "pending" && batch.status !== "pending") {
      // A tick that learned nothing does not reopen a batch: "pending" is the
      // rollup's default, and a reaped batch with no rows would otherwise be
      // pulled back to pending, re-taking the (tag, payer) submit lock and
      // resetting the reaper's clock, for as long as a client polls it.
    } else if (batchStatus !== batch.status) {
      const confirmedAt =
        isTerminal && !batch.confirmedAt ? new Date() : batch.confirmedAt;
      const [updated] = await TransactionBatch.update(
        { status: batchStatus, confirmedAt },
        {
          where: { id: batch.id, status: batch.status },
          transaction: dbTransaction,
        },
      );
      if (updated > 0) {
        batch.status = batchStatus;
        batch.confirmedAt = confirmedAt;
      }
    }

    // Commit the transaction
    await dbTransaction.commit();
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
  for (const signature of newlyConfirmed) {
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

  // Reported from the rows as stored, for the same reason the batch is.
  return {
    ...storedBatchStatus(batch.status, transactions),
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
