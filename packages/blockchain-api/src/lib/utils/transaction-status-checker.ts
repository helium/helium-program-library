import { Connection, VersionedTransactionResponse } from "@solana/web3.js";
import { env } from "../env";
import { jitoBlockEngineRequest } from "./jito";
import PendingTransaction, {
  TransactionStatus,
} from "../models/pending-transaction";
import TransactionBatch, { BatchStatus } from "../models/transaction-batch";
import { sequelize } from "../db";

export interface TransactionStatusResult {
  signature: string;
  status: TransactionStatus;
  transaction: VersionedTransactionResponse | null;
}

export interface BatchStatusResult {
  batchStatus: BatchStatus;
  confirmedCount: number;
  failedCount: number;
  transactionStatuses: TransactionStatusResult[];
  jitoBundleStatus?: any;
}

/**
 * Check the status of a single transaction
 */
export async function checkTransactionStatus(
  pendingTx: PendingTransaction,
  batch: TransactionBatch,
  connection: Connection,
  commitment: "confirmed" | "finalized" = "confirmed",
  currentBlockHeight?: number,
): Promise<TransactionStatusResult> {
  let txStatus: TransactionStatus = pendingTx.status;
  let transaction = null;

  // Skip checking if signature is still a placeholder (batch ID format)
  if (!pendingTx.signature.startsWith(batch.id)) {
    // Check transaction status on-chain
    const tx = await connection.getTransaction(pendingTx.signature, {
      maxSupportedTransactionVersion: 0,
      commitment,
    });

    if (tx && tx.meta?.err) {
      txStatus = "failed";
    } else if (tx) {
      txStatus = "confirmed";
      transaction = tx;
      // Note: notifyIndexers is called outside the transaction to avoid aborting it
    } else {
      // Check if blockhash has expired by comparing block heights
      if (pendingTx.lastValidBlockHeight && currentBlockHeight !== undefined) {
        if (currentBlockHeight > pendingTx.lastValidBlockHeight) {
          txStatus = "expired";
        } else {
          txStatus = "pending";
        }
      } else {
        // Fallback for old records without lastValidBlockHeight
        txStatus = "expired";
      }
    }
  }

  return {
    signature: pendingTx.signature,
    status: txStatus,
    transaction,
  };
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
  const transactions = batch.transactions || [];

  let batchStatus: BatchStatus = "pending";
  let confirmedCount = 0;
  let failedCount = 0;
  const dbTransaction = await sequelize.transaction();

  try {
    // Fetch current block height once for all expiry checks
    const currentBlockHeight = await connection.getBlockHeight({ commitment });

    // Check Jito bundle status first
    const jitoResult = await checkJitoBundleStatus(batch);
    batchStatus = jitoResult.status;
    const jitoBundleStatus = jitoResult.jitoBundleStatus;

    // Check individual transaction statuses
    // Only catch network errors from checkTransactionStatus - database errors will naturally abort the transaction
    const transactionStatusPromises = transactions.map(
      async (pendingTx: PendingTransaction) => {
        try {
          const result = await checkTransactionStatus(
            pendingTx,
            batch,
            connection,
            commitment,
            currentBlockHeight,
          );

          // Count statuses
          if (result.status === "confirmed") {
            confirmedCount++;
          } else if (
            result.status === "failed" ||
            result.status === "expired"
          ) {
            failedCount++;
          }

          // Update transaction status in database
          // If this fails, it will abort the transaction and bubble up to outer catch
          if (result.status !== pendingTx.status) {
            pendingTx.status = result.status;

            if (result.status === "confirmed") {
              await pendingTx.destroy({ transaction: dbTransaction });
            } else {
              await pendingTx.save({ transaction: dbTransaction });
            }
          }

          return result;
        } catch (error) {
          // Only catch non-database errors (network timeouts, etc.) so they don't abort the transaction
          // Database errors will naturally abort the transaction and bubble up
          if (
            error &&
            typeof error === "object" &&
            "name" in error &&
            error.name === "SequelizeDatabaseError"
          ) {
            throw error;
          }
          // Log network/other errors and continue with current status
          console.error(
            `Error checking status for transaction ${pendingTx.signature}:`,
            error,
          );
          return {
            signature: pendingTx.signature,
            status: pendingTx.status,
            transaction: null,
          };
        }
      },
    );

    const transactionStatuses = await Promise.all(transactionStatusPromises);

    // Determine overall batch status
    if (confirmedCount === transactions.length) {
      batchStatus = "confirmed";
    } else if (failedCount > 0) {
      if (confirmedCount > 0) {
        batchStatus = "partial";
      } else {
        batchStatus = "failed";
      }
    }

    // Update batch status in database
    if (batchStatus !== batch.status) {
      batch.status = batchStatus;
      await batch.save({ transaction: dbTransaction });
    }

    // Commit the transaction
    await dbTransaction.commit();

    // Notify indexers for confirmed transactions AFTER committing the transaction
    // This prevents indexer errors from aborting the database transaction
    const confirmedTransactions = transactionStatuses.filter(
      (ts) => ts.status === "confirmed" && ts.transaction !== null,
    );
    for (const confirmedTx of confirmedTransactions) {
      try {
        await notifyIndexers(confirmedTx.signature);
      } catch (error) {
        // Log but don't throw - indexer notification is not critical
        console.error(
          `Error notifying indexers for transaction ${confirmedTx.signature}:`,
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
