import { PendingTransactionInfo } from "@/hooks/usePersistentTransactions";
import { client } from "@/lib/orpc";

export const fetchPendingTransactions = async (
  walletAddress: string,
): Promise<PendingTransactionInfo[]> => {
  const data = await client.transactions.getByPayer({
    payer: walletAddress,
    status: "pending",
    limit: 100,
    page: 1,
  });

  return data.batches.map((batch) => {
    const transactionCount = batch.transactions.length;
    const firstTransaction = batch.transactions[0];

    // Generate description based on transaction metadata
    let description: string;
    if (transactionCount === 1 && firstTransaction?.metadata?.description) {
      description = firstTransaction.metadata.description;
    } else if (transactionCount > 1) {
      description = `${transactionCount} transactions in progress`;
    } else {
      description = "Transaction in progress";
    }

    return {
      batchId: batch.batchId,
      tag: batch.tag || "unknown",
      type: firstTransaction?.metadata?.type || "unknown",
      description,
      createdAt: batch.createdAt,
      status: batch.status as any,
      transactionCount,
      transactions: batch.transactions.map((tx) => ({
        type: tx.metadata?.type || "unknown",
        description: tx.metadata?.description || "Transaction",
      })),
    };
  });
};

export const fetchTransactionStatus = async (batchId: string) => {
  return await client.transactions.get({
    id: batchId,
    commitment: "confirmed",
  });
};
