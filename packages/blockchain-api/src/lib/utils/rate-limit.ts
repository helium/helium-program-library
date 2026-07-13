export interface RateLimiterOptions {
  windowMs: number;
  /** Max hits allowed per key within the window. A value <= 0 disables the
   * check (all requests pass). May be a function so the limit can be read from
   * env per call rather than frozen at construction. */
  max: number | (() => number);
  maxKeys?: number;
  now?: () => number;
}

/**
 * Creates an in-memory sliding-window rate limiter. The returned `check(key)`
 * records the hit and returns false once a key exceeds `max` hits within
 * `windowMs`, true otherwise.
 *
 * State lives in a Map pruned on access; it is capped at `maxKeys` (oldest
 * inserted evicted first) so a flood of distinct keys can't grow it without
 * bound. This is best-effort per-process protection, not a distributed limiter.
 */
export function createRateLimiter({
  windowMs,
  max,
  maxKeys = 10_000,
  now = Date.now,
}: RateLimiterOptions) {
  const hits = new Map<string, number[]>();

  return function check(key: string): boolean {
    const limit = typeof max === "function" ? max() : max;
    if (limit <= 0) return true;

    const current = now();
    const cutoff = current - windowMs;
    const timestamps = (hits.get(key) || []).filter((t) => t > cutoff);

    if (timestamps.length >= limit) {
      hits.set(key, timestamps);
      return false;
    }

    timestamps.push(current);
    hits.set(key, timestamps);

    if (hits.size > maxKeys) {
      const oldest = hits.keys().next().value;
      if (oldest !== undefined) hits.delete(oldest);
    }

    return true;
  };
}
