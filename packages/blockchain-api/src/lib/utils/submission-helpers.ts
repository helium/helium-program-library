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

// Minimal structural shape of a compiled transaction message (static keys +
// header) so write-lock checks stay unit-testable without web3.js fixtures.
export interface MinimalCompiledMessage {
  staticAccountKeys: Array<{ toBase58(): string }>;
  header: {
    numRequiredSignatures: number;
    numReadonlySignedAccounts: number;
    numReadonlyUnsignedAccounts: number;
  };
}

/**
 * Whether a compiled message write-locks any of the given accounts. Only
 * static account keys are considered (Jito tip transfers never use lookup
 * tables).
 */
export function messageWriteLocksAnyAccount(
  message: MinimalCompiledMessage,
  accounts: Set<string>,
): boolean {
  const keys = message.staticAccountKeys;
  const {
    numRequiredSignatures,
    numReadonlySignedAccounts,
    numReadonlyUnsignedAccounts,
  } = message.header;
  const writableSignedCount = numRequiredSignatures - numReadonlySignedAccounts;
  const unsignedStart = numRequiredSignatures;
  const writableUnsignedCount =
    keys.length - numRequiredSignatures - numReadonlyUnsignedAccounts;

  for (let i = 0; i < writableSignedCount; i++) {
    if (accounts.has(keys[i].toBase58())) return true;
  }
  for (let i = 0; i < writableUnsignedCount; i++) {
    if (accounts.has(keys[unsignedStart + i].toBase58())) return true;
  }
  return false;
}

/**
 * Tags used by batches whose transactions were crafted by the client rather
 * than this server (older wallet-app releases and third-party clients build
 * their own claim/burn transactions and submit them without a Jito tip).
 * Server-crafted bundles always include a tip, so a missing tip on these tags
 * means a stale client, not a server bug.
 */
export function isClientCraftedBundleTag(tag?: string): boolean {
  return Boolean(
    tag && (tag.includes("implicit-burn") || tag.includes("claim-rewards")),
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
