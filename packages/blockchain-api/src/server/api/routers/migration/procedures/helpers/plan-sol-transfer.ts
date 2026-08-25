export interface SolTransferPlan {
  /** Lamports to transfer, or null when there is nothing to transfer. */
  lamports: bigint | null;
  warning?: string;
}

/**
 * Decides how much native SOL a migration can actually move. The client amount
 * is advisory: the app replays full amounts on retry, so a stale amount would
 * otherwise build a transfer that can only fail with `insufficient lamports`.
 * The fee payer signs and funds every transaction in the bundle, so the source
 * keeps nothing back for fees or rent and its whole balance is transferable.
 */
export const planSolTransfer = (
  requestedLamports: bigint,
  liveBalanceLamports: bigint,
): SolTransferPlan => {
  if (liveBalanceLamports <= BigInt(0)) {
    return {
      lamports: null,
      warning: "Skipping SOL transfer: no balance to migrate",
    };
  }

  if (requestedLamports > liveBalanceLamports) {
    return {
      lamports: liveBalanceLamports,
      warning: `Reduced the SOL transfer to the wallet's live balance of ${liveBalanceLamports} lamports (${requestedLamports} requested).`,
    };
  }

  return { lamports: requestedLamports };
};
