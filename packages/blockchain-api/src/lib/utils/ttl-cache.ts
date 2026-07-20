interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface TtlCacheOptions {
  ttlMs: number;
  maxEntries?: number;
  now?: () => number;
}

/**
 * Creates a keyed in-memory cache that serves fresh values within a TTL and
 * coalesces concurrent requests for the same key into a single in-flight call.
 *
 * Coalescing matters more than the TTL here: bursts of identical requests
 * (e.g. a client re-requesting a quote) share one upstream call instead of
 * each hitting a rate-limited API.
 *
 * Note: cached values are returned by reference, so every caller served from
 * the cache (or coalesced onto one in-flight call) receives the same object.
 * Callers must treat the result as read-only; mutating it corrupts the entry
 * for everyone. Callers that need to mutate should copy first (e.g. getTokens
 * slices the cached list before reordering).
 */
export function createTtlCache<T>({
  ttlMs,
  maxEntries = 1000,
  now = Date.now,
}: TtlCacheOptions) {
  const entries = new Map<string, CacheEntry<T>>();
  const inFlight = new Map<string, Promise<T>>();

  function prune(current: number): void {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= current) {
        entries.delete(key);
      }
    }
  }

  return function dedupe(key: string, fetcher: () => Promise<T>): Promise<T> {
    const hit = entries.get(key);
    if (hit && hit.expiresAt > now()) {
      return Promise.resolve(hit.value);
    }

    const pending = inFlight.get(key);
    if (pending) {
      return pending;
    }

    const promise = fetcher()
      .then((value) => {
        // Refreshing an existing key: drop it first so it re-inserts as the
        // newest entry and doesn't count against the capacity check below.
        entries.delete(key);
        if (entries.size >= maxEntries) {
          prune(now());
          // Pruning only reclaims expired entries. If everything is still
          // fresh and we're at capacity, evict oldest-first (insertion order)
          // so maxEntries stays a hard bound rather than a soft target.
          while (entries.size >= maxEntries) {
            const oldest = entries.keys().next().value;
            if (oldest === undefined) break;
            entries.delete(oldest);
          }
        }
        entries.set(key, { value, expiresAt: now() + ttlMs });
        return value;
      })
      .finally(() => {
        inFlight.delete(key);
      });

    inFlight.set(key, promise);
    return promise;
  };
}
