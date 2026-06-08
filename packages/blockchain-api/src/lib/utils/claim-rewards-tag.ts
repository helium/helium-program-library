import { createHash } from "crypto";
import { PublicKey } from "@solana/web3.js";

/**
 * Deterministic per-batch dedup tag derived from the batch's hotspot set.
 *
 * Same hotspot set -> same tag (dedups true duplicate submits), while distinct
 * hasMore batches get distinct tags (no false short-circuit / silent partial).
 * The partial unique index on (tag, payer) WHERE status='pending' uses this to
 * gate concurrent submits.
 */
export function batchTag(wallet: string, assets: PublicKey[]): string {
  const hash = createHash("sha256")
    .update(
      assets
        .map((a) => a.toBase58())
        .sort()
        .join(",")
    )
    .digest("hex")
    .slice(0, 16);
  return `claim_rewards:${wallet}:${hash}`;
}
