import { publicProcedure } from "../../../procedures";
import PendingTransaction from "@/lib/models/pending-transaction";
import TransactionBatch from "@/lib/models/transaction-batch";
import {
  BatchStatusResult,
  checkAndUpdateBatchStatus,
} from "@/lib/utils/transaction-status-checker";
import { connectToDb } from "@/lib/utils/db";
import { storedBatchStatus } from "@/lib/utils/batch-status";

/**
 * Get transaction batch status by ID.
 */
export const get = publicProcedure.transactions.get.handler(
  async ({ input, errors }) => {
    const { id, commitment } = input;

    await connectToDb();

    const batch = await TransactionBatch.findByPk(id, {
      include: [
        {
          model: PendingTransaction,
          as: "transactions",
        },
      ],
    });

    if (!batch) {
      throw errors.NOT_FOUND({ message: "Batch not found" });
    }

    // Snapshot the stored state before the check: checkAndUpdateBatchStatus
    // re-reads the batch's rows and mutates the loaded instances in memory
    // before committing, and a rollback does not revert them.
    const snapshotBatchStatus = batch.status;
    const storedStatuses = (batch.transactions || []).map((tx) => ({
      signature: tx.signature,
      status: tx.status,
    }));

    let result: BatchStatusResult;
    try {
      result = await checkAndUpdateBatchStatus(batch, commitment);
    } catch (error) {
      if (error instanceof Error && error.name === "SequelizeDatabaseError") {
        throw error;
      }
      // A transient RPC failure (e.g. a 500 from getBlockHeight) must not
      // surface as a 500 to a client that is polling. Serve the stored state;
      // the background job re-checks on its next tick.
      console.error(`Status check failed for batch ${batch.id}:`, error);
      result = storedBatchStatus(snapshotBatchStatus, storedStatuses);
    }

    return {
      batchId: batch.id,
      status: result.batchStatus,
      submissionType: batch.submissionType,
      parallel: batch.parallel,
      transactions: result.transactionStatuses,
      jitoBundleId: batch.jitoBundleId,
      jitoBundleStatus: result.jitoBundleStatus,
    };
  },
);
