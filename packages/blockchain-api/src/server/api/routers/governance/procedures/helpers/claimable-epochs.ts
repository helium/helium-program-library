import { EPOCH_LENGTH } from "@helium/helium-sub-daos-sdk";
import { isClaimed } from "@helium/voter-stake-registry-sdk";
import BN from "bn.js";
import { getLockupKind } from "./constants";

// Epochs at or after the delegation's expiration pay zero rewards and
// close_delegation_v0 no longer requires claiming them. The epoch containing
// expiration_ts still pays, so the exclusive end-epoch bound is
// epoch(expiration - 1) + 1. An expirationTs of 0 means no expiration.
export const expirationCapEpoch = (expirationTs: BN): number =>
  expirationTs.isZero()
    ? Number.MAX_SAFE_INTEGER
    : expirationTs.sub(new BN(1)).div(new BN(EPOCH_LENGTH)).toNumber() + 1;

export interface ClaimableEpochRangeArgs {
  lockup: {
    kind: object;
    endTs: BN;
  };
  delegatedPosition: {
    lastClaimedEpoch: BN;
    claimedEpochsBitmap: BN;
    expirationTs: BN;
  };
  /** Cluster clock `unix_timestamp`. */
  unixNow: number;
}

export interface ClaimableEpochRange {
  /** `lastClaimedEpoch + 1`. */
  startEpoch: number;
  /**
   * Exclusive. `currentEpoch` (the current epoch is never claimable), or
   * `epoch(lockup.endTs) + 1` once a non-constant lockup has ended, capped by
   * the delegation's expiration.
   */
  rawEndEpoch: number;
  /**
   * Exclusive. `lastClaimedEpoch + 129`: the on-chain bitmap only tracks 128
   * epochs past `lastClaimedEpoch`, so anything beyond needs another call
   * after earlier claims land.
   */
  bitmapWindowEnd: number;
  /** Exclusive. `min(rawEndEpoch, bitmapWindowEnd)`. */
  endEpoch: number;
  /**
   * Last epoch close_delegation_v0 requires claimed; mirrors
   * `to_claim_to_epoch` in close_delegation_v0.rs.
   */
  closeRequiresThroughEpoch: number;
  /** Epochs in `[startEpoch, endEpoch)` not yet marked claimed in the bitmap. */
  unclaimedEpochs: number[];
}

/**
 * The epochs a claim would attempt for one delegated position, before looking
 * at whether each epoch's rewards have been issued. Shared by the claim
 * builder and getPositions so the two cannot disagree.
 */
export const getClaimableEpochRange = ({
  lockup,
  delegatedPosition,
  unixNow,
}: ClaimableEpochRangeArgs): ClaimableEpochRange => {
  const currentEpoch = Math.floor(unixNow / EPOCH_LENGTH);
  const lockupKind = getLockupKind(lockup);
  const isConstant = lockupKind === "constant";
  const isDecayed = !isConstant && lockup.endTs.lte(new BN(unixNow));
  const decayedEpoch = lockup.endTs.div(new BN(EPOCH_LENGTH)).toNumber();
  const isCliff = lockupKind === "cliff";
  const expirationCap = expirationCapEpoch(delegatedPosition.expirationTs);

  const closeRequiresThroughEpoch = Math.min(
    isDecayed && isCliff ? decayedEpoch - 1 : currentEpoch - 1,
    expirationCap - 1,
  );

  const lastClaimedEpoch = delegatedPosition.lastClaimedEpoch.toNumber();
  const startEpoch = lastClaimedEpoch + 1;
  const bitmapWindowEnd = lastClaimedEpoch + 129;
  const rawEndEpoch = Math.min(
    isDecayed ? decayedEpoch + 1 : currentEpoch,
    expirationCap,
  );
  const endEpoch = Math.min(rawEndEpoch, bitmapWindowEnd);

  const unclaimedEpochs: number[] = [];
  for (let e = startEpoch; e < endEpoch; e++) {
    if (
      !isClaimed({
        epoch: e,
        lastClaimedEpoch,
        claimedEpochsBitmap: delegatedPosition.claimedEpochsBitmap,
      })
    ) {
      unclaimedEpochs.push(e);
    }
  }

  return {
    startEpoch,
    rawEndEpoch,
    bitmapWindowEnd,
    endEpoch,
    closeRequiresThroughEpoch,
    unclaimedEpochs,
  };
};

/**
 * Whether a `SubDaoEpochInfoV0` has had its rewards issued. Claims for an
 * unissued epoch fail on-chain (`EpochNotClosed`), so the claim builder skips
 * them and getPositions does not count them as claimable.
 */
export const isEpochInfoIssued = (
  epochInfo: { rewardsIssuedAt: BN | null } | null | undefined,
): boolean => !!epochInfo?.rewardsIssuedAt;

export interface ClaimableEpochSummary {
  /** Unclaimed epochs in range whose rewards are issued: what a claim emits now. */
  claimableEpochCount: number;
  /**
   * Unclaimed epochs close_delegation_v0 requires that are not issued yet:
   * what undelegatePosition rejects with BAD_REQUEST.
   */
  unissuedRequiredEpochCount: number;
}

export const summarizeClaimableEpochs = (
  range: ClaimableEpochRange,
  isIssued: (epoch: number) => boolean,
): ClaimableEpochSummary => {
  let claimableEpochCount = 0;
  let unissuedRequiredEpochCount = 0;
  for (const epoch of range.unclaimedEpochs) {
    if (isIssued(epoch)) {
      claimableEpochCount++;
    } else if (epoch <= range.closeRequiresThroughEpoch) {
      unissuedRequiredEpochCount++;
    }
  }
  return { claimableEpochCount, unissuedRequiredEpochCount };
};
