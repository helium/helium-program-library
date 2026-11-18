/** The time now, in milliseconds. */
export type Clock = () => number;

/**
 * How long a signed fee-funding transaction is held after its build resolves, in milliseconds.
 * The transaction is held while its build is in flight, and the time runs from when the build
 * resolves, after the transaction takes its blockhash. A blockhash lasts 150 blocks of block
 * height, at least about 60 seconds and usually longer, so 90 seconds covers it: no second
 * transaction is signed while the first can still land.
 */
export const FUND_FEES_HOLD_MS = 90_000;

/** How long a mint's estimate is kept, in milliseconds. */
export const ESTIMATE_CACHE_MS = 15_000;

/**
 * A map whose entries expire `ttlMs` after they are set, or `ttlMs` after `startExpiry` for an
 * entry set by `hold`. A set or a hold removes the expired entries.
 */
export const expiringMap = <V>(ttlMs: number, now: Clock) => {
  const entries = new Map<string, { value: V; expiresAt: number }>();
  const put = (key: string, value: V, expiresAt: number): void => {
    const time = now();
    for (const [entryKey, entry] of entries) {
      if (entry.expiresAt <= time) {
        entries.delete(entryKey);
      }
    }
    entries.set(key, { value, expiresAt });
  };
  return {
    get: (key: string): V | undefined => {
      const entry = entries.get(key);
      return entry && entry.expiresAt > now() ? entry.value : undefined;
    },
    set: (key: string, value: V): void => put(key, value, now() + ttlMs),
    /** Sets `key` to `value` with no expiry until `startExpiry`. */
    hold: (key: string, value: V): void => put(key, value, Infinity),
    /** Expires `key` `ttlMs` from now when it still holds `value`. */
    startExpiry: (key: string, value: V): void => {
      const entry = entries.get(key);
      if (entry?.value === value) {
        entry.expiresAt = now() + ttlMs;
      }
    },
    /** Removes `key` when it still holds `value`. */
    release: (key: string, value: V): void => {
      if (entries.get(key)?.value === value) {
        entries.delete(key);
      }
    },
    /** The entries held, expired or not. */
    get size(): number {
      return entries.size;
    },
  };
};

/**
 * Signs one fee-funding transaction per wallet and mint at a time. While a wallet's build for a
 * mint is in flight, and for `FUND_FEES_HOLD_MS` after it resolves, a request for the same wallet
 * and mint gets the same transaction, built once. Requests for another mint are held apart. A
 * failed build releases the wallet and mint.
 */
export const fundFeesStore = (now: Clock) => {
  const held = expiringMap<Promise<Uint8Array>>(FUND_FEES_HOLD_MS, now);
  return async (
    request: { wallet: string; mint: string },
    build: () => Promise<Uint8Array>
  ): Promise<Uint8Array> => {
    const key = `${request.wallet}:${request.mint}`;
    const pending = held.get(key);
    if (pending) {
      return pending;
    }
    const transaction = build();
    held.hold(key, transaction);
    transaction.then(
      () => held.startExpiry(key, transaction),
      () => held.release(key, transaction)
    );
    return transaction;
  };
};

/**
 * Keeps each mint's estimate for `ESTIMATE_CACHE_MS` from the start of its load. Concurrent callers
 * share one load. A failed load is not kept.
 */
export const estimateCache = (now: Clock) => {
  const estimates = expiringMap<Promise<string>>(ESTIMATE_CACHE_MS, now);
  return async (mint: string, load: () => Promise<string>): Promise<string> => {
    const cached = estimates.get(mint);
    if (cached) {
      return cached;
    }
    const estimate = load();
    estimates.set(mint, estimate);
    estimate.catch(() => estimates.release(mint, estimate));
    return estimate;
  };
};
