import type { SubmissionType } from "../models/transaction-batch";

// Minimal structural shape of a Solana signature status so this module stays
// free of heavy runtime imports and is trivially unit-testable.
export interface MinimalSignatureStatus {
  err: unknown;
  confirmationStatus?: string | null;
}

/**
 * Decide whether the real (non-tip) transactions of a Jito bundle have all
 * landed on-chain, given their signature statuses in submission order. Used to
 * treat a bundle rejection (e.g. -32602 "already processed transaction") as
 * success when the transactions actually processed.
 *
 * `statuses` aligns 1:1 with `transactionMetadata` (both indexed by the bundle's
 * transaction order). Tip transactions are ignored; the bundle counts as landed
 * only if every real transaction is confirmed/finalized with no error.
 */
export function isBundleLanded(
  statuses: Array<MinimalSignatureStatus | null>,
  transactionMetadata?: Array<Record<string, unknown> | undefined>,
): boolean {
  const realStatuses = statuses.filter(
    (_, i) => transactionMetadata?.[i]?.type !== "jito_tip",
  );
  const toCheck = realStatuses.length > 0 ? realStatuses : statuses;

  if (toCheck.length === 0) return false;

  return toCheck.every(
    (status) =>
      status != null &&
      status.err == null &&
      (status.confirmationStatus === "confirmed" ||
        status.confirmationStatus === "finalized"),
  );
}

/**
 * Predict the submission type for a batch reservation that is recorded before
 * the batch is actually submitted. Mirrors the branching in
 * submitTransactionBatch so the reservation row matches the eventual result.
 */
export function predictSubmissionType(params: {
  transactionCount: number;
  useJitoBundle: boolean;
  parallel: boolean;
}): SubmissionType {
  const { transactionCount, useJitoBundle, parallel } = params;
  if (transactionCount === 1) return "single";
  if (useJitoBundle) return "jito_bundle";
  return parallel ? "parallel" : "sequential";
}
