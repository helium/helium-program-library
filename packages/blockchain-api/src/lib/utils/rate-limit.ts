export interface RateLimiterOptions {
  windowMs: number;
  /** Max hits allowed per key within the window. A value <= 0 disables the
   * check (all requests pass). A thunk so the limit can be read from env per
   * call rather than frozen at construction. */
  max: () => number;
  maxKeys?: number;
  now?: () => number;
}

/**
 * Creates an in-memory sliding-window rate limiter. The returned `check(key)`
 * records the hit and returns false once a key exceeds `max` hits within
 * `windowMs`, true otherwise.
 *
 * State lives in a Map pruned on access; it is capped at `maxKeys` (least
 * recently used evicted first) so a flood of distinct keys can't grow it
 * without bound. LRU rather than FIFO eviction matters: with FIFO, a throttled
 * client could flood unique keys to evict its own hot key and reset its count.
 * This is best-effort per-process protection, not a distributed limiter.
 */
export const createRateLimiter = ({
  windowMs,
  max,
  maxKeys = 10_000,
  now = Date.now,
}: RateLimiterOptions) => {
  const hits = new Map<string, number[]>();

  // Delete-then-set moves the key to the back of the Map's insertion order,
  // so eviction below removes the least recently used key.
  const touch = (key: string, timestamps: number[]) => {
    hits.delete(key);
    hits.set(key, timestamps);
  };

  return function check(key: string): boolean {
    const limit = max();
    if (limit <= 0) return true;

    const current = now();
    const cutoff = current - windowMs;
    const timestamps = (hits.get(key) || []).filter((t) => t > cutoff);

    if (timestamps.length >= limit) {
      touch(key, timestamps);
      return false;
    }

    timestamps.push(current);
    touch(key, timestamps);

    if (hits.size > maxKeys) {
      const oldest = hits.keys().next().value;
      if (oldest !== undefined) hits.delete(oldest);
    }

    return true;
  };
};

/** Parses a rate limit from an env value at check time (not module load) so
 * ops and tests can adjust it without reimporting; falls back on missing or
 * unparseable values. A value of 0 disables the check. */
export const parseRateLimit = (
  value: string | undefined,
  fallback: number,
): number => {
  if (value === undefined || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

/**
 * Best-effort client IP for rate-limit keying: the right-most x-forwarded-for
 * hop, i.e. the one appended by our own ingress. Left-most hops are
 * client-supplied and trivially spoofable. Even so, the resulting key is only
 * as trustworthy as the ingress's XFF handling — treat limiters keyed on it as
 * a courtesy throttle, not a security boundary.
 */
export const getClientIp = (headerStore: {
  get(name: string): string | null;
}): string => {
  return (
    headerStore.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown"
  );
};
