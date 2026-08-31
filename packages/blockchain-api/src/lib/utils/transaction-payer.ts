import type { VersionedTransaction } from "@solana/web3.js";
import { verifyEd25519 } from "./ed25519";

/**
 * The account that pays for a transaction, returned only once the transaction
 * carries that account's own signature over its message. Null otherwise, which
 * is the answer for an unsigned transaction, one signed by somebody else, and
 * one whose message was altered after signing.
 *
 * A transaction's first static account key is its fee payer and the first
 * signature is that account's. Extra signatures belong to other authorities the
 * instructions require -- a transfer whose fee payer is not its source has two
 * -- and are left to the cluster to check, because the fee payer is the only
 * account this answer names.
 */
export function verifiedFeePayer(tx: VersionedTransaction): string | null {
  const feePayer = tx.message.staticAccountKeys[0];
  const signature = tx.signatures[0];
  if (!feePayer || !signature) {
    return null;
  }
  if (!verifyEd25519(tx.message.serialize(), signature, feePayer.toBytes())) {
    return null;
  }
  return feePayer.toBase58();
}
