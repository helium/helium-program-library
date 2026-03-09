import { VersionedTransaction } from "@solana/web3.js";
import { getCluster } from "../solana";

/**
 * Get Solana Explorer URL for inspecting a transaction.
 * @param transaction - The versioned transaction to inspect
 * @returns The explorer URL for the transaction
 */
export function getExplorerUrl(transaction: VersionedTransaction): string {
  const message = Buffer.from(transaction.message.serialize()).toString(
    "base64",
  );
  const cluster = getCluster();
  return `https://explorer.solana.com/tx/inspector?cluster=${cluster}&message=${encodeURIComponent(message)}`;
}
