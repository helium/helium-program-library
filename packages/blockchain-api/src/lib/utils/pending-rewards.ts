import type { BulkRewards } from "@helium/distributor-oracle";
import BN from "bn.js";

/**
 * Pending oracle rewards for a single entity: the median of the oracles'
 * reported `currentRewards` minus what the recipient has already been
 * distributed. Sorts with `BN.cmp` (subtracting and calling `.toNumber()`
 * overflows for large reward amounts). The result may be negative when the
 * recipient is ahead of the current median; callers clamp or compare as needed.
 */
export const pendingOracleRewards = (
  rewards: BulkRewards[],
  entityKey: string,
  recipientAcc: { totalRewards?: BN } | null | undefined
): BN => {
  const sortedOracleRewards = rewards
    .map((rew) => new BN(rew.currentRewards[entityKey] || 0))
    .sort((a, b) => a.cmp(b));
  const oracleMedian =
    sortedOracleRewards[Math.floor(sortedOracleRewards.length / 2)] ??
    new BN(0);
  const alreadyDistributed = recipientAcc?.totalRewards ?? new BN(0);
  return oracleMedian.sub(alreadyDistributed);
};
