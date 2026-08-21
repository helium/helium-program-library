import { Op } from "sequelize";

export const RESUBMISSION_BACKOFF_BASE_MS = 5000;
export const RESUBMISSION_BACKOFF_CAP_MS = 20000;

/**
 * How long a batch that has already been resubmitted `resubmissionCount` times
 * must wait before it may be resubmitted again: 5s, doubling to a 20s cap.
 * Every replica polls every 2s with no cross-replica coordination, so this
 * per-batch window is what stops one batch from being resubmitted on every
 * tick of every replica.
 */
export function resubmissionBackoffMs(resubmissionCount: number): number {
  return Math.min(
    RESUBMISSION_BACKOFF_BASE_MS * 2 ** resubmissionCount,
    RESUBMISSION_BACKOFF_CAP_MS
  );
}

/**
 * WHERE fragment selecting batches that still have retries left and whose
 * backoff window has elapsed. One clause per attempt count keeps the entire
 * check in the query, so the replicas mostly stay out of each other's way.
 */
export function resubmissionEligibilityWhere(
  maxRetries: number,
  now: Date = new Date()
) {
  return {
    resubmissionCount: { [Op.lt]: maxRetries },
    [Op.or]: [
      { lastResubmittedAt: null },
      ...Array.from({ length: Math.max(maxRetries, 0) }, (_, count) => ({
        resubmissionCount: count,
        lastResubmittedAt: {
          [Op.lte]: new Date(now.getTime() - resubmissionBackoffMs(count)),
        },
      })),
    ],
  };
}
