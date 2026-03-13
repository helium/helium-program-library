import { publicProcedure } from "../../../procedures";
import PendingTransaction from "@/lib/models/pending-transaction";
import TransactionBatch from "@/lib/models/transaction-batch";
import { checkAndUpdateBatchStatus } from "@/lib/utils/transaction-status-checker";
import { connectToDb } from "@/lib/utils/db";

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

    const result = await checkAndUpdateBatchStatus(batch, commitment);

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
