import { Op } from "sequelize";

export const RESUBMISSION_BACKOFF_BASE_MS = 5000;
export const RESUBMISSION_BACKOFF_CAP_MS = 20000;
export const DEFAULT_MAX_RESUBMISSIONS = 10;

/**
 * How long a batch must wait after its `resubmissionCount`th resubmission
 * before it may be resubmitted again: 5s after the first, doubling to a 20s
 * cap. Every replica polls every 2s with no cross-replica coordination, so
 * this per-batch window is what stops one batch from being resubmitted on
 * every tick of every replica.
 */
export function resubmissionBackoffMs(resubmissionCount: number): number {
  return Math.min(
    RESUBMISSION_BACKOFF_BASE_MS * 2 ** Math.max(resubmissionCount - 1, 0),
    RESUBMISSION_BACKOFF_CAP_MS,
  );
}

/**
 * WHERE fragment selecting batches that still have retries left and whose
 * backoff window has elapsed, keeping the entire check in the query. The
 * curve reaches its cap after a few counts, so one clause per pre-cap count
 * plus a catch-all at the cap covers every count, and the never-resubmitted
 * case joins them.
 */
export function resubmissionEligibilityWhere(
  maxRetries: number,
  now: Date = new Date(),
) {
  const cutoff = (waitMs: number) => ({
    [Op.lte]: new Date(now.getTime() - waitMs),
  });
  const windows: Record<string | symbol, unknown>[] = [
    { lastResubmittedAt: null },
  ];
  let count = 1;
  while (resubmissionBackoffMs(count) < RESUBMISSION_BACKOFF_CAP_MS) {
    windows.push({
      resubmissionCount: count,
      lastResubmittedAt: cutoff(resubmissionBackoffMs(count)),
    });
    count++;
  }
  windows.push({
    resubmissionCount: { [Op.gte]: count },
    lastResubmittedAt: cutoff(RESUBMISSION_BACKOFF_CAP_MS),
  });
  return {
    resubmissionCount: { [Op.lt]: maxRetries },
    [Op.or]: windows,
  };
}
