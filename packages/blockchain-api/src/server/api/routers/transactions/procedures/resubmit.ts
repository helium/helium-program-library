import { publicProcedure } from "../../../procedures";
import TransactionBatch from "@/lib/models/transaction-batch";
import PendingTransaction from "@/lib/models/pending-transaction";
import { resubmitTransactionBatch } from "@/lib/utils/transaction-resubmission";

/**
 * Resubmit a batch of pending transactions that may have failed.
 */
export const resubmit = publicProcedure.transactions.resubmit.handler(
  async ({ input, errors }) => {
    const { id } = input;

    // Find the batch
    const batch = await TransactionBatch.findByPk(id, {
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

    if (!batch) {
      throw errors.NOT_FOUND({ message: "Batch not found" });
    }

    if (batch.status !== "pending") {
      throw errors.BAD_REQUEST({ message: "Batch is not in pending status" });
    }

    const pendingTransactions =
      (batch as unknown as { transactions?: PendingTransaction[] })
        .transactions || [];
    if (pendingTransactions.length === 0) {
      throw errors.BAD_REQUEST({
        message: "No pending transactions to resubmit",
      });
    }

    // Attempt resubmission
    const result = await resubmitTransactionBatch(batch, pendingTransactions);

    if (result.success) {
      return {
        success: true,
        message: "Transactions resubmitted successfully",
        ...(result.newSignatures && { newSignatures: result.newSignatures }),
      };
    } else {
      return {
        success: false,
        message: "Failed to resubmit transactions",
        error: result.error,
      };
    }
  },
);
