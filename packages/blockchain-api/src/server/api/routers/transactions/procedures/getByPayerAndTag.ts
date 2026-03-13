import { publicProcedure } from "../../../procedures";
import PendingTransaction from "@/lib/models/pending-transaction";
import TransactionBatch, { BatchStatus } from "@/lib/models/transaction-batch";
import { connectToDb } from "@/lib/utils/db";
import { Op } from "sequelize";

/**
 * Get transaction batches by payer address and tag.
 */
export const getByPayerAndTag =
  publicProcedure.transactions.getByPayerAndTag.handler(
    async ({ input, errors }) => {
      const { payer, tag, page, limit, status } = input;

      await connectToDb();

      if (!payer) {
        throw errors.BAD_REQUEST({ message: "Payer is required" });
      }

      if (!tag) {
        throw errors.BAD_REQUEST({ message: "Tag is required" });
      }

      // Parse status filter
      let statusFilter: BatchStatus[] = ["pending"];

      if (status) {
        const requestedStatuses = status
          .split(",")
          .map((s) => s.trim()) as BatchStatus[];
        const validStatuses: BatchStatus[] = [
          "pending",
          "confirmed",
          "failed",
          "expired",
          "partial",
        ];
        statusFilter = requestedStatuses.filter((s) =>
          validStatuses.includes(s),
        );

        if (statusFilter.length === 0) {
          throw errors.BAD_REQUEST({
            message:
              "Invalid status filter. Valid values: pending, confirmed, failed, expired, partial",
          });
        }
      }

      const offset = (page - 1) * limit;

      // Build where clause
      const whereClause = {
        payer,
        tag,
        status: {
          [Op.in]: statusFilter,
        },
      };

      // Get total count for pagination
      const total = await TransactionBatch.count({
        where: whereClause,
      });

      // Find paginated transaction batches for the payer and tag
      const batches = await TransactionBatch.findAll({
        where: whereClause,
        include: [
          {
            model: PendingTransaction,
            as: "transactions",
          },
        ],
        order: [["createdAt", "DESC"]],
        limit,
        offset,
      });

      const batchSummaries = batches.map((batch) => ({
        batchId: batch.id,
        tag: batch.tag || undefined,
        status: batch.status,
        submissionType: batch.submissionType,
        parallel: batch.parallel,
        createdAt: batch.createdAt.toISOString(),
        updatedAt: batch.updatedAt.toISOString(),
        transactions:
          (
            batch as unknown as { transactions?: { metadata?: unknown }[] }
          ).transactions?.map((tx) => ({
            metadata: tx.metadata as
              | { type: string; description: string }
              | undefined,
          })) || [],
      }));

      const totalPages = Math.ceil(total / limit);

      return {
        payer,
        batches: batchSummaries,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    },
  );
