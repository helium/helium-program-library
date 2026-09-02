/**
 * The lifetime to record for one transaction, derived from that transaction's
 * own recent blockhash instead of from a blockhash fetched at submit time — a
 * transaction signed minutes ago carries a blockhash that dies long before the
 * one the cluster hands out now, and recording the fresh one's lifetime keeps
 * a dead batch in the resubmission loop until it hits the retry cap.
 *
 * Returns undefined when the transaction's own blockhash is already out of
 * range: it can never land, so it gets no lifetime and the caller rejects it
 * rather than storing a fictional one.
 *
 * Solana RPC answers "is this blockhash still usable" but exposes no lookup
 * from a blockhash to the block height that produced it, so a transaction
 * built on an older-but-still-valid blockhash gets the tightest bound
 * available: it cannot outlive the blockhash the cluster just handed out.
 * Expiry inside that bound is decided by probing the transaction's own
 * blockhash — see `decideBatchExpiry`.
 */
export function deriveLastValidBlockHeight(params: {
  /** Whether the cluster still accepts this transaction's own blockhash. */
  blockhashValid: boolean;
  /** Lifetime of the blockhash the cluster hands out now, the upper bound. */
  latestLastValidBlockHeight: number;
}): number | undefined {
  return params.blockhashValid ? params.latestLastValidBlockHeight : undefined;
}

/** The stored state of one transaction row, all the expiry decision needs from it. */
export interface BlockhashExpiryRow {
  signature: string;
  blockhash?: string | null;
  lastValidBlockHeight?: number | null;
}

export interface BatchExpiryDecision {
  /** At least one transaction can no longer land, so the batch is dead. */
  expired: boolean;
  /** Signatures of the transactions whose blockhash is out of range. */
  expiredSignatures: string[];
  /** Human-readable reason, for the resubmission result and the log line. */
  reason?: string;
}

/**
 * Decide whether a pending batch still has a usable blockhash.
 *
 * A batch is resubmitted as a whole — the same signed transactions, the same
 * blockhashes — so one dead transaction kills the whole attempt: Jito answers
 * "bundle contains an expired blockhash" and RPC answers "transaction is
 * invalid". The batch is expired instead of consuming another retry slot.
 *
 * Kept free of RPC and database imports so the decision is unit-testable: the
 * caller reads the current block height once per batch, probes the blockhashes
 * and does the persistence.
 *
 * `blockhashValidity` maps a blockhash to whether the cluster still accepts it.
 * It is the transaction's own blockhash answering, so it outranks the stored
 * lifetime, which is only ever a bound. A blockhash it has no entry for (the
 * probe failed, or the row predates the blockhash column) falls back to that
 * bound.
 */
export function decideBatchExpiry(params: {
  transactions: readonly BlockhashExpiryRow[];
  currentBlockHeight: number;
  blockhashValidity?: ReadonlyMap<string, boolean>;
}): BatchExpiryDecision {
  const { transactions, currentBlockHeight, blockhashValidity } = params;

  const expiredSignatures = transactions
    .filter((tx) => isRowExpired(tx, currentBlockHeight, blockhashValidity))
    .map((tx) => tx.signature);

  if (expiredSignatures.length === 0) {
    return { expired: false, expiredSignatures: [] };
  }

  return {
    expired: true,
    expiredSignatures,
    reason: `Blockhash expired at block height ${currentBlockHeight} for ${expiredSignatures.length} of ${transactions.length} transactions`,
  };
}

function isRowExpired(
  tx: BlockhashExpiryRow,
  currentBlockHeight: number,
  blockhashValidity?: ReadonlyMap<string, boolean>,
): boolean {
  const valid = tx.blockhash ? blockhashValidity?.get(tx.blockhash) : undefined;
  if (valid !== undefined) {
    return !valid;
  }

  // Rows written before lastValidBlockHeight existed carry no lifetime, so it
  // cannot be checked. The single-transaction resubmit path and the status
  // checker both call that expired; a resubmission is the wrong place to guess.
  if (tx.lastValidBlockHeight == null) {
    return true;
  }
  return currentBlockHeight > tx.lastValidBlockHeight;
}
