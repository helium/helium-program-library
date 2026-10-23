export type SkipReason = "unissued" | "no delegation rewards";

export type SkippedEpoch = { epoch: number; reason: SkipReason };

export type EpochRewardsState = {
  subDaoEpochInfo: {
    rewardsIssued: boolean;
    hntRewardsIssued: boolean;
  } | null;
  daoEpochInfo: {
    doneIssuingRewards: boolean;
    delegationRewardsIssued: boolean;
  } | null;
};

export type ClaimDecision = "claim" | "skipped" | "dropped";

// Decide epochs in ascending order: the window opens at the first skipped epoch.
export const createClaimWindow = () => {
  const skipped: SkippedEpoch[] = [];
  const dropped: number[] = [];
  // last_claimed_epoch stops below the first skipped epoch, and the claim bitmap reaches only 128 epochs past it.
  const isPastClaimWindow = (epoch: number) =>
    skipped.length > 0 && epoch > skipped[0].epoch - 1 + 128;
  const skip = (epoch: number, reason: SkipReason): ClaimDecision => {
    skipped.push({ epoch, reason });
    return "skipped";
  };

  const decide = (
    epoch: number,
    readState: () => EpochRewardsState,
  ): ClaimDecision => {
    if (isPastClaimWindow(epoch)) {
      dropped.push(epoch);
      return "dropped";
    }
    const { subDaoEpochInfo, daoEpochInfo } = readState();
    if (!subDaoEpochInfo) return skip(epoch, "unissued");
    // claim_rewards_v0 fails EpochNotClosed until rewards_issued_at
    // is set, and claim_rewards_v1 until the DAO epoch's
    // done_issuing_rewards is set.
    if (!subDaoEpochInfo.rewardsIssued) return skip(epoch, "unissued");
    if (!subDaoEpochInfo.hntRewardsIssued) return "claim";
    // claim_rewards_v1 also fails EpochNotClosed until the DAO
    // epoch is done issuing rewards.
    if (!daoEpochInfo) return skip(epoch, "unissued");
    if (!daoEpochInfo.doneIssuingRewards) return skip(epoch, "unissued");
    // claim_rewards_v1 also rejects an epoch with no delegation
    // rewards issued.
    if (!daoEpochInfo.delegationRewardsIssued)
      return skip(epoch, "no delegation rewards");
    return "claim";
  };

  return {
    decide,
    get skipped(): readonly SkippedEpoch[] {
      return skipped;
    },
    get dropped(): readonly number[] {
      return dropped;
    },
  };
};
