import type { Commitment } from "@solana/web3.js";

/**
 * The lifetime to record for one transaction, derived from that transaction's
 * own recent blockhash instead of from a blockhash fetched at submit time — a
 * transaction signed minutes ago carries a blockhash that dies long before the
 * one the cluster hands out now, and recording the fresh one's lifetime keeps
 * a dead batch in the resubmission loop until it hits the retry cap.
 *
 * Returns undefined when the transaction's own blockhash is already out of
 * range, or when the probe could not answer: it gets no lifetime rather than a
 * fictional one, and `isTransactionExpired` decides from the blockhash itself.
 *
 * Solana RPC answers "is this blockhash still usable" but exposes no lookup
 * from a blockhash to the block height that produced it, so a transaction
 * built on an older-but-still-valid blockhash gets the tightest bound
 * available: it cannot outlive the blockhash the cluster just handed out.
 * Expiry inside that bound is decided by probing the transaction's own
 * blockhash — see `isTransactionExpired`.
 */
export function deriveLastValidBlockHeight(params: {
  /** Whether the cluster still accepts this transaction's own blockhash, or undefined when the probe could not answer. */
  blockhashValid: boolean | undefined;
  /** Lifetime of the blockhash the cluster hands out now, the upper bound. */
  latestLastValidBlockHeight: number;
}): number | undefined {
  return params.blockhashValid === true
    ? params.latestLastValidBlockHeight
    : undefined;
}

/** The slice of a Solana `Connection` the blockhash probe uses. */
export interface BlockhashProbeRpc {
  isBlockhashValid(
    blockhash: string,
    config: { commitment: Commitment },
  ): Promise<{ value: boolean }>;
}

/**
 * Ask the cluster whether each blockhash is still usable.
 *
 * A blockhash the probe cannot answer for is left out of the map, so callers
 * fall back to the stored lifetime rather than to a guess.
 */
export async function probeBlockhashValidity(
  rpc: BlockhashProbeRpc,
  blockhashes: readonly string[],
  commitment: Commitment = "confirmed",
): Promise<Map<string, boolean>> {
  const validity = new Map<string, boolean>();

  await Promise.all(
    [...new Set(blockhashes)].map(async (blockhash) => {
      try {
        const { value } = await rpc.isBlockhashValid(blockhash, { commitment });
        validity.set(blockhash, value);
      } catch (error) {
        console.warn(
          `[probeBlockhashValidity] Failed to check blockhash ${blockhash}:`,
          error,
        );
      }
    }),
  );

  return validity;
}
