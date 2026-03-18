import { publicProcedure } from "../../../procedures";
import TransactionBatch from "@/lib/models/transaction-batch";
import PendingTransaction from "@/lib/models/pending-transaction";
import WalletHistory from "@/lib/models/wallet-history";
import { syncWalletHistory } from "@/lib/utils/wallet-history-sync";
import { Op } from "sequelize";
import type { HistoryAction } from "@helium/blockchain-api/schemas/transactions";

export const history = publicProcedure.transactions.history.handler(
  async ({ input, errors }) => {
    const { payer, page, limit, actionType } = input;

    // Refresh on-chain cache from Helius
    try {
      await syncWalletHistory(payer);
    } catch (error) {
      console.error("Failed to sync wallet history:", error);
      // Continue with stale cache rather than failing the request
    }

    // Query blockchain-api batches
    const batchWhere: Record<string, unknown> = {
      payer,
      status: { [Op.in]: ["confirmed", "failed", "partial", "expired"] },
    };
    if (actionType) {
      batchWhere.actionType = actionType;
    }

    const [batches, batchCount] = await Promise.all([
      TransactionBatch.findAll({
        where: batchWhere,
        include: [
          {
            model: PendingTransaction,
            as: "transactions",
            attributes: [
              "signature",
              "status",
              "type",
              "metadata",
            ],
          },
        ],
        order: [["confirmedAt", "DESC NULLS LAST"]],
        limit,
        offset: (page - 1) * limit,
      }),
      TransactionBatch.count({ where: batchWhere }),
    ]);

    // Query on-chain wallet history
    const historyWhere: Record<string, unknown> = { wallet: payer };
    if (actionType) {
      historyWhere.actionType = actionType;
    }

    const [historyRows, historyCount] = await Promise.all([
      WalletHistory.findAll({
        where: historyWhere,
        order: [["slot", "DESC"]],
        limit,
        offset: (page - 1) * limit,
      }),
      WalletHistory.count({ where: historyWhere }),
    ]);

    // Merge into unified actions
    const actions: HistoryAction[] = [];

    for (const batch of batches) {
      actions.push({
        id: batch.id,
        source: "blockchain_api",
        actionType: batch.actionType || batch.tag || "unknown",
        actionMetadata: batch.actionMetadata || null,
        status: batch.status,
        transactions: (batch.transactions || []).map((tx) => ({
          signature: tx.signature,
          status: tx.status,
          type: tx.type,
          metadata: tx.metadata as Record<string, unknown> | undefined,
        })),
        timestamp: (
          batch.confirmedAt || batch.createdAt
        ).toISOString(),
      });
    }

    for (const row of historyRows) {
      actions.push({
        id: String(row.id),
        source: "on_chain",
        actionType: row.actionType,
        actionMetadata: row.actionMetadata || null,
        status: "confirmed",
        transactions: [
          {
            signature: row.signature,
            status: "confirmed",
            type: row.actionType,
          },
        ],
        timestamp: row.timestamp.toISOString(),
      });
    }

    // Sort merged results by timestamp descending and take page
    actions.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    const paged = actions.slice(0, limit);

    const total = batchCount + historyCount;
    const totalPages = Math.ceil(total / limit);

    return {
      payer,
      actions: paged,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  },
);
