import type { TransactionStatus } from "../models/pending-transaction";
import type { BatchStatus } from "../models/transaction-batch";
import type { MinimalSignatureStatus } from "./submission-helpers";

/** The stored state of one transaction row, all the decision needs from it. */
export interface BatchTransactionRow {
  signature: string;
  status: TransactionStatus;
  blockhash?: string | null;
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

/** The batch's stored state, reported as a decision when the cluster could not be read. */
export function storedBatchStatus(
  batchStatus: BatchStatus,
  transactions: readonly Pick<BatchTransactionRow, "signature" | "status">[],
): BatchStatusDecision {
  return {
    batchStatus,
    confirmedCount: transactions.filter((tx) => tx.status === "confirmed")
      .length,
    failedCount: transactions.filter(
      (tx) => tx.status === "failed" || tx.status === "expired",
    ).length,
    transactionStatuses: transactions.map((tx) => ({
      signature: tx.signature,
      status: tx.status,
    })),
  };
}

/** Confirmation levels that count as landed for the commitment that was asked for. */
const LANDED_LEVELS: Record<"confirmed" | "finalized", readonly string[]> = {
  confirmed: ["confirmed", "finalized"],
  finalized: ["finalized"],
};

/**
 * Statuses the cluster itself handed us. "expired" is absent on purpose: it is
 * our own inference from a blockhash leaving range, and a batch can land in its
 * last valid block, so an expired row stays open to being re-read.
 */
const SETTLED_STATUSES: readonly TransactionStatus[] = ["confirmed", "failed"];

/** Whether a row's stored status came from the cluster and so never changes again. */
export function isSettledTransactionStatus(status: TransactionStatus): boolean {
  return SETTLED_STATUSES.includes(status);
}

/**
 * Whether one transaction can no longer land.
 *
 * The single expiry rule: the transaction's own blockhash answers if the probe
 * reached it, because the stored lifetime is only ever an upper bound — a
 * transaction signed minutes ago carries a blockhash that dies well before the
 * one the cluster handed out at submit time. Without an answer it falls back to
 * that bound, and a row with neither (written before the column existed, or
 * read on a tick with no block height) counts as expired: a resubmission is the
 * wrong place to guess.
 */
export function isTransactionExpired(params: {
  transaction: Pick<BatchTransactionRow, "blockhash" | "lastValidBlockHeight">;
  currentBlockHeight?: number;
  blockhashValidity?: ReadonlyMap<string, boolean>;
}): boolean {
  const { transaction, currentBlockHeight, blockhashValidity } = params;

  const valid = transaction.blockhash
    ? blockhashValidity?.get(transaction.blockhash)
    : undefined;
  if (valid !== undefined) {
    return !valid;
  }

  if (
    transaction.lastValidBlockHeight == null ||
    currentBlockHeight === undefined
  ) {
    return true;
  }
  return currentBlockHeight > transaction.lastValidBlockHeight;
}

/**
 * Decide the status of every row in a batch, and of the batch itself, from the
 * signature statuses just read off the cluster.
 *
 * Kept free of RPC and database imports so the rollup is unit-testable: the
 * caller does the lookups (signature statuses, current block height, blockhash
 * validity) and the persistence.
 *
 * `signatureStatuses` maps signature to the status the cluster reported, or
 * null/absent when the cluster has never seen it. `blockhashValidity` maps a
 * blockhash to whether the cluster still accepts it.
 */
export function decideBatchStatus(params: {
  batchId: string;
  transactions: readonly BatchTransactionRow[];
  signatureStatuses: ReadonlyMap<string, MinimalSignatureStatus | null>;
  currentBlockHeight?: number;
  blockhashValidity?: ReadonlyMap<string, boolean>;
  commitment?: "confirmed" | "finalized";
  /** Status the bundle check already produced, for a Jito batch. */
  jitoBatchStatus?: BatchStatus;
}): BatchStatusDecision {
  const {
    batchId,
    transactions,
    signatureStatuses,
    currentBlockHeight,
    blockhashValidity,
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
      blockhashValidity,
    ),
  }));

  const confirmedCount = transactionStatuses.filter(
    (ts) => ts.status === "confirmed",
  ).length;
  const failedCount = transactionStatuses.filter(
    (ts) => ts.status === "failed" || ts.status === "expired",
  ).length;

  let batchStatus: BatchStatus = jitoBatchStatus;
  // A batch with no rows yet is a reservation mid-submission, not a batch whose
  // every transaction confirmed.
  if (transactions.length > 0 && confirmedCount === transactions.length) {
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
  blockhashValidity?: ReadonlyMap<string, boolean>,
): TransactionStatus {
  // A row the cluster already settled keeps its status: the cluster drops a
  // signature once it ages out of its history, and that must not turn a
  // confirmed row back into an expired one.
  if (isSettledTransactionStatus(tx.status)) {
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
  return isTransactionExpired({
    transaction: tx,
    currentBlockHeight,
    blockhashValidity,
  })
    ? "expired"
    : "pending";
}
