import type { BatchStatus } from "../models/transaction-batch";
import {
  decideBatchStatus,
  isSettledTransactionStatus,
  type BatchStatusDecision,
  type BatchTransactionRow,
} from "./batch-status";
import {
  probeBlockhashValidity,
  type BlockhashProbeRpc,
} from "./blockhash-expiry";
import type { MinimalSignatureStatus } from "./submission-helpers";

/** The slice of a Solana `Connection` the read phase uses. */
export interface BatchStatusRpc extends BlockhashProbeRpc {
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

  const open = transactions.filter(
    (tx) => !isSettledTransactionStatus(tx.status),
  );

  let currentBlockHeight: number;
  let signatureStatuses: Map<string, MinimalSignatureStatus | null>;
  let blockhashValidity: Map<string, boolean>;
  try {
    [currentBlockHeight, signatureStatuses, blockhashValidity] =
      await Promise.all([
        rpc.getBlockHeight({ commitment }),
        fetchSignatureStatuses(rpc, batchId, open),
        // Always probed at "confirmed", whatever commitment the caller asked
        // for: the probe answers "can this still land at all", not "has it
        // landed at the level asked for". At "finalized" the cluster answers
        // against a bank ~32 slots back, so a blockhash younger than that is
        // reported invalid and a transaction that is about to land would be
        // written expired.
        probeBlockhashValidity(
          rpc,
          open.flatMap((tx) => (tx.blockhash ? [tx.blockhash] : [])),
          "confirmed",
        ),
      ]);
  } catch (error) {
    console.error(`Cluster read failed for batch ${batchId}:`, error);
    return null;
  }

  return decideBatchStatus({
    batchId,
    transactions,
    signatureStatuses,
    currentBlockHeight,
    blockhashValidity,
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
 * Placeholder signatures (`${batchId}-${index}`) were never sent, so there is
 * nothing to look up.
 */
async function fetchSignatureStatuses(
  rpc: BatchStatusRpc,
  batchId: string,
  transactions: readonly BatchTransactionRow[],
): Promise<Map<string, MinimalSignatureStatus | null>> {
  const signatures = transactions
    .filter((tx) => !tx.signature.startsWith(batchId))
    .map((tx) => tx.signature);

  if (signatures.length === 0) {
    return new Map();
  }

  const { value } = await rpc.getSignatureStatuses(signatures, {
    searchTransactionHistory: true,
  });

  return new Map(signatures.map((signature, i) => [signature, value[i]]));
}
