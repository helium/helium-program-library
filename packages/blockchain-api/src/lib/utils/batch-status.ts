import type { TransactionStatus } from "../models/pending-transaction";
import type { BatchStatus } from "../models/transaction-batch";
import type { MinimalSignatureStatus } from "./submission-helpers";

/** The stored state of one transaction row, all the decision needs from it. */
export interface BatchTransactionRow {
  signature: string;
  status: TransactionStatus;
  lastValidBlockHeight?: number | null;
}

export interface BatchTransactionDecision {
  signature: string;
  status: TransactionStatus;
}

export interface BatchStatusDecision {
  transactionStatuses: BatchTransactionDecision[];
  confirmedCount: number;
  failedCount: number;
  batchStatus: BatchStatus;
}

/** Confirmation levels that count as landed for the commitment that was asked for. */
const LANDED_LEVELS: Record<"confirmed" | "finalized", readonly string[]> = {
  confirmed: ["confirmed", "finalized"],
  finalized: ["finalized"],
};

/**
 * Decide the status of every row in a batch, and of the batch itself, from the
 * signature statuses just read off the cluster.
 *
 * Kept free of RPC and database imports so the rollup is unit-testable: the
 * caller does the two lookups (signature statuses, current block height) and
 * the persistence.
 *
 * `signatureStatuses` maps signature to the status the cluster reported, or
 * null/absent when the cluster has never seen it.
 */
export function decideBatchStatus(params: {
  batchId: string;
  transactions: readonly BatchTransactionRow[];
  signatureStatuses: ReadonlyMap<string, MinimalSignatureStatus | null>;
  currentBlockHeight?: number;
  commitment?: "confirmed" | "finalized";
  /** Status the bundle check already produced, for a Jito batch. */
  jitoBatchStatus?: BatchStatus;
}): BatchStatusDecision {
  const {
    batchId,
    transactions,
    signatureStatuses,
    currentBlockHeight,
    commitment = "confirmed",
    jitoBatchStatus = "pending",
  } = params;
  const landed = LANDED_LEVELS[commitment];

  const transactionStatuses = transactions.map((tx) => ({
    signature: tx.signature,
    status: decideTransactionStatus(
      tx,
      batchId,
      signatureStatuses.get(tx.signature),
      landed,
      currentBlockHeight,
    ),
  }));

  const confirmedCount = transactionStatuses.filter(
    (ts) => ts.status === "confirmed",
  ).length;
  const failedCount = transactionStatuses.filter(
    (ts) => ts.status === "failed" || ts.status === "expired",
  ).length;

  let batchStatus: BatchStatus = jitoBatchStatus;
  if (confirmedCount === transactions.length) {
    batchStatus = "confirmed";
  } else if (failedCount > 0) {
    batchStatus = confirmedCount > 0 ? "partial" : "failed";
  }

  return { transactionStatuses, confirmedCount, failedCount, batchStatus };
}

function decideTransactionStatus(
  tx: BatchTransactionRow,
  batchId: string,
  signatureStatus: MinimalSignatureStatus | null | undefined,
  landed: readonly string[],
  currentBlockHeight?: number,
): TransactionStatus {
  // A row that already reached a terminal status keeps it: the cluster drops a
  // signature once it ages out of its history, and that must not turn a
  // confirmed row back into an expired one.
  if (tx.status !== "pending") {
    return tx.status;
  }

  // A placeholder signature (`${batchId}-${index}`) was never sent, so there is
  // nothing to look up and no blockhash of its own to expire against.
  if (tx.signature.startsWith(batchId)) {
    return tx.status;
  }

  if (signatureStatus) {
    if (signatureStatus.err != null) {
      return "failed";
    }
    if (landed.includes(signatureStatus.confirmationStatus ?? "")) {
      return "confirmed";
    }
  }

  // Never seen, or seen but not yet confirmed at the commitment asked for: it
  // can still land until its blockhash goes out of range.
  if (tx.lastValidBlockHeight != null && currentBlockHeight !== undefined) {
    return currentBlockHeight > tx.lastValidBlockHeight ? "expired" : "pending";
  }
  // Old rows predate lastValidBlockHeight, so expiry cannot be checked.
  return "expired";
}
