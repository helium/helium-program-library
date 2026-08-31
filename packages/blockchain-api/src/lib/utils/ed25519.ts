import { createPublicKey, verify } from "crypto";

/** Bytes in an Ed25519 signature. */
export const ED25519_SIGNATURE_BYTES = 64;

/** Bytes in an Ed25519 public key. */
const ED25519_PUBLIC_KEY_BYTES = 32;

/**
 * DER SubjectPublicKeyInfo header for an Ed25519 key. Prepending it to the raw
 * 32-byte key is what lets the platform verifier take a Solana public key, so
 * verification needs no third-party curve library.
 */
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/**
 * Whether `signature` is `publicKey`'s Ed25519 signature over `message`.
 *
 * Every malformed input answers false rather than throwing: a signature or key
 * of the wrong length, and a key that is not a point on the curve. A caller can
 * therefore treat one false as "refuse", without a second path for inputs that
 * never had a chance of verifying.
 */
export function verifyEd25519(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  if (
    signature.length !== ED25519_SIGNATURE_BYTES ||
    publicKey.length !== ED25519_PUBLIC_KEY_BYTES
  ) {
    return false;
  }

  try {
    const key = createPublicKey({
      key: Buffer.concat([SPKI_PREFIX, Buffer.from(publicKey)]),
      format: "der",
      type: "spki",
    });
    return verify(null, message, key, signature);
  } catch {
    return false;
  }
}
