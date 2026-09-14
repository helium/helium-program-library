import { PublicKey } from "@solana/web3.js";

// Input checks for /ledger/migrate. The service signs every tx it returns as
// fee payer, so these are the only thing keeping a caller from steering that
// signature somewhere it should not go. Returns an error message, or
// undefined when the request is acceptable.
export function validateMigrateWallets(
  from: PublicKey,
  to: PublicKey,
  feePayer: PublicKey
): string | undefined {
  // With `from` set to the service wallet it would sign a sweep of its own
  // balance to `to`.
  if (from.equals(feePayer)) {
    return "Invalid source wallet";
  }
  // The service also signs the `to` side of ledgerTransferPositionV0, so a
  // destination equal to its own wallet parks assets in a wallet the guard
  // above bars as a source.
  if (to.equals(feePayer)) {
    return "Invalid destination wallet";
  }
  if (from.equals(to)) {
    return "Source and destination must differ";
  }
  // Off-curve destinations can never sign, so anything sent there — locked
  // positions included — is unrecoverable.
  if (!PublicKey.isOnCurve(to.toBytes())) {
    return "Destination must be on-curve";
  }
  return undefined;
}
