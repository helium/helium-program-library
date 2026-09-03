import type { Commitment } from "@solana/web3.js";

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
