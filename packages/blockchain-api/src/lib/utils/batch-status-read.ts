import type { BatchStatus } from "../models/transaction-batch";
import {
  decideBatchStatus,
  type BatchStatusDecision,
  type BatchTransactionRow,
} from "./batch-status";
import type { MinimalSignatureStatus } from "./submission-helpers";

/** The slice of a Solana `Connection` the read phase uses. */
export interface BatchStatusRpc {
  getBlockHeight(config: {
    commitment: "confirmed" | "finalized";
  }): Promise<number>;
  getSignatureStatuses(
    signatures: string[],
    config: { searchTransactionHistory: boolean },
  ): Promise<{ value: (MinimalSignatureStatus | null)[] }>;
}

/**
 * Read the cluster's view of a batch and decide what its rows should become.
 *
 * Every network read the status check needs happens here, so its caller can do
 * them all before it opens a database transaction: an RPC call inside an open
 * transaction pins a connection for the whole round trip, and an RPC failure
 * mid-transaction leaves it aborted (`25P02`) and reads as "Failed to update
 * database".
 *
 * Returns null when the cluster cannot be read, which means "skip this batch
 * this tick": nothing is written, so nothing is decided from a partial view.
 */
export async function readBatchStatus(params: {
  rpc: BatchStatusRpc;
  batchId: string;
  transactions: readonly BatchTransactionRow[];
  commitment?: "confirmed" | "finalized";
  /** Status the bundle check already produced, for a Jito batch. */
  jitoBatchStatus?: BatchStatus;
}): Promise<BatchStatusDecision | null> {
  const {
    rpc,
    batchId,
    transactions,
    commitment = "confirmed",
    jitoBatchStatus,
  } = params;

  let currentBlockHeight: number;
  let signatureStatuses: Map<string, MinimalSignatureStatus | null>;
  try {
    currentBlockHeight = await rpc.getBlockHeight({ commitment });
    signatureStatuses = await fetchSignatureStatuses(
      rpc,
      batchId,
      transactions,
    );
  } catch (error) {
    console.error(`Cluster read failed for batch ${batchId}:`, error);
    return null;
  }

  return decideBatchStatus({
    batchId,
    transactions,
    signatureStatuses,
    currentBlockHeight,
    commitment,
    jitoBatchStatus,
  });
}

/**
 * Read the cluster's view of every signature that still needs one, in a single
 * call. `searchTransactionHistory` matters: without it the production RPC
 * answers null for a signature that confirmed moments ago, which used to leave
 * a landed batch pending and resubmitting.
 *
 * Placeholder signatures (`${batchId}-${index}`) were never sent, and rows that
 * already reached a terminal status are not re-read — a signature the cluster
 * has aged out must not un-confirm a row.
 */
async function fetchSignatureStatuses(
  rpc: BatchStatusRpc,
  batchId: string,
  transactions: readonly BatchTransactionRow[],
): Promise<Map<string, MinimalSignatureStatus | null>> {
  const signatures = transactions
    .filter(
      (tx) => tx.status === "pending" && !tx.signature.startsWith(batchId),
    )
    .map((tx) => tx.signature);

  if (signatures.length === 0) {
    return new Map();
  }

  const { value } = await rpc.getSignatureStatuses(signatures, {
    searchTransactionHistory: true,
  });

  return new Map(signatures.map((signature, i) => [signature, value[i]]));
}
