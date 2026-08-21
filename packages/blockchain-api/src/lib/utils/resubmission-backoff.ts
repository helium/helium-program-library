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
