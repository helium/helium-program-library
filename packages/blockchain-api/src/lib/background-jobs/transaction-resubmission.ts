import PendingTransaction from "../models/pending-transaction";
import TransactionBatch from "../models/transaction-batch";
import {
  getPendingTransactionsForResubmission,
  resubmitTransactionBatch,
} from "../utils/transaction-resubmission";
import { checkAndUpdateBatchStatus } from "../utils/transaction-status-checker";

interface ResubmissionServiceConfig {
  intervalMs: number;
  maxRetries: number;
  enabled: boolean;
}

class TransactionResubmissionService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private config: ResubmissionServiceConfig;

  constructor(
    config: ResubmissionServiceConfig = {
      intervalMs: 2000, // 2 seconds
      maxRetries: 10,
      enabled: true,
    },
  ) {
    this.config = config;
  }

  /**
   * Start the resubmission service
   */
  start(): void {
    if (this.isRunning) {
      console.log("Transaction resubmission service is already running");
      return;
    }

    if (!this.config.enabled) {
      console.log("Transaction resubmission service is disabled");
      return;
    }

    console.log(
      `Starting transaction resubmission service with ${this.config.intervalMs}ms interval`,
    );

    this.isRunning = true;
    this.intervalId = setInterval(async () => {
      try {
        await this.processPendingTransactions();
      } catch (error) {
        console.error("Error in transaction resubmission service:", error);
      }
    }, this.config.intervalMs);
  }

  /**
   * Stop the resubmission service
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log("Transaction resubmission service stopped");
  }

  /**
   * Check if the service is running
   */
  isServiceRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Update the service configuration
   */
  updateConfig(newConfig: Partial<ResubmissionServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log(
      "Transaction resubmission service config updated:",
      this.config,
    );
  }

  /**
   * Process all pending transactions that need resubmission
   */
  private async processPendingTransactions(): Promise<void> {
    try {
      const { batches } = await getPendingTransactionsForResubmission();

      if (batches.length === 0) {
        return; // No pending transactions to process
      }

      console.log(`Processing ${batches.length} pending transaction batches`);

      // Process batches in parallel but limit concurrency
      const concurrencyLimit = 5;
      const chunks = this.chunkArray(batches, concurrencyLimit);

      for (const chunk of chunks) {
        await Promise.all(
          chunk.map(async ({ batch, transactions }) => {
            try {
              await this.processBatch(batch, transactions);
            } catch (error) {
              console.error(`Error processing batch ${batch.id}:`, error);
            }
          }),
        );
      }
    } catch (error) {
      console.error("Error processing pending transactions:", error);
    }
  }

  /**
   * Process a single batch for resubmission
   */
  private async processBatch(
    batch: TransactionBatch,
    transactions: PendingTransaction[],
  ): Promise<void> {
    try {
      // Use the existing working logic to check and update batch status
      const result = await checkAndUpdateBatchStatus(batch, "confirmed");

      // If batch is no longer pending, we're done
      if (result.batchStatus !== "pending") {
        return;
      }

      // Get transactions that are still pending after status check
      const stillPending = transactions.filter(
        (tx) =>
          result.transactionStatuses.find((ts) => ts.signature === tx.signature)
            ?.status === "pending",
      );

      if (stillPending.length > 0) {
        console.log(
          `Resubmitting ${stillPending.length} transactions in batch ${batch.id}`,
        );

        try {
          const result = await resubmitTransactionBatch(batch, stillPending);

          if (result.success) {
            console.log(`Successfully resubmitted batch ${batch.id}`);
          } else {
            console.error(
              `Failed to resubmit batch ${batch.id}:`,
              result.error,
            );
          }
        } catch (error) {
          console.error(`Error resubmitting batch ${batch.id}:`, error);
        }
      }
    } catch (error) {
      console.error(`Error processing batch ${batch.id}:`, error);
    }
  }

  /**
   * Split array into chunks for controlled concurrency
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}

// Create and export a singleton instance
export const transactionResubmissionService =
  new TransactionResubmissionService();

export default TransactionResubmissionService;
