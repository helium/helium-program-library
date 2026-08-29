import { ED25519_SIGNATURE_BYTES, verifyEd25519 } from "./ed25519";

/**
 * The furthest ahead an approval's expiry may be when it is claimed. The
 * welcome-pack program holds every approval to this same bound
 * (`MAX_CLAIM_APPROVAL_SECONDS` in
 * `programs/welcome-pack/src/instructions/claim_welcome_pack_v0.rs`), so an
 * approval reaching past it cannot be claimed and is refused before this
 * service pays for a transaction carrying it.
 */
export const MAX_CLAIM_APPROVAL_SECONDS = 30 * 24 * 60 * 60;

/**
 * The message the pack owner signs to approve a claim, built exactly as the
 * program rebuilds it from the pack's `unique_id` and the expiry in the
 * instruction's arguments. The two spellings have to agree byte for byte or a
 * signature that the program accepts is refused here.
 */
export function claimApprovalMessage(
  uniqueId: number,
  expirationTs: number
): string {
  return `Approve invite ${uniqueId} expiring ${expirationTs}`;
}

/** Why an approval was refused. Each endpoint maps these to its own errors. */
export type ClaimApprovalRejection =
  | "malformed_expiration"
  | "expired"
  | "window_too_long"
  | "malformed_signature"
  | "invalid_signature";

export type ClaimApprovalResult =
  | { ok: true; signature: Buffer }
  | { ok: false; reason: ClaimApprovalRejection };

/**
 * What a caller is told about an approval this service will not pay for. The
 * two reasons a signature can be unusable share one message, so a caller
 * learns that the signature was refused and not which check refused it.
 */
export const CLAIM_APPROVAL_MESSAGES: Record<ClaimApprovalRejection, string> = {
  malformed_expiration: "Invalid invite expiration",
  expired: "Invite has expired",
  window_too_long: "Invite expires too far in the future",
  malformed_signature: "Invalid delegate signature",
  invalid_signature: "Invalid delegate signature",
};

/**
 * Check a claim approval before anything is built or signed on its behalf.
 * `owner` is the pack owner's raw public key, the only key the program will
 * accept the approval from; `now` is the caller's clock in seconds.
 *
 * A successful result carries the decoded signature so the caller does not
 * decode it a second time, and so the bytes that were verified are the bytes
 * that go into the instruction.
 */
export function verifyClaimApproval({
  uniqueId,
  expirationTs,
  owner,
  signatureBase64,
  now,
}: {
  uniqueId: number;
  expirationTs: number;
  owner: Uint8Array;
  signatureBase64: string;
  now: number;
}): ClaimApprovalResult {
  if (!Number.isSafeInteger(expirationTs)) {
    return { ok: false, reason: "malformed_expiration" };
  }
  if (expirationTs <= now) {
    return { ok: false, reason: "expired" };
  }
  if (expirationTs > now + MAX_CLAIM_APPROVAL_SECONDS) {
    return { ok: false, reason: "window_too_long" };
  }

  // Base64 decoding is lenient, so the length check is what rejects a signature
  // that is not one, rather than a throw further down.
  const signature = Buffer.from(signatureBase64, "base64");
  if (signature.length !== ED25519_SIGNATURE_BYTES) {
    return { ok: false, reason: "malformed_signature" };
  }

  const message = Buffer.from(
    claimApprovalMessage(uniqueId, expirationTs),
    "utf8"
  );
  if (!verifyEd25519(message, signature, owner)) {
    return { ok: false, reason: "invalid_signature" };
  }

  return { ok: true, signature };
}
