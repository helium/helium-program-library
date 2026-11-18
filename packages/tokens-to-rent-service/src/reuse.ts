/** The time now, in milliseconds. */
export type Clock = () => number;

/**
 * How long a wallet's signed fee-funding transaction is held, in milliseconds. The time runs from
 * the request, before the transaction takes its blockhash, so a held transaction is never older
 * than this.
 */
export const FUND_FEES_HOLD_MS = 60_000;

/** How long a mint's estimate is kept, in milliseconds. */
export const ESTIMATE_CACHE_MS = 15_000;

/** A map whose entries expire `ttlMs` after they are set. A set removes the expired entries. */
const expiringMap = <V>(ttlMs: number, now: Clock) => {
  const entries = new Map<string, { value: V; expiresAt: number }>();
  return {
    get: (key: string): V | undefined => {
      const entry = entries.get(key);
      return entry && entry.expiresAt > now() ? entry.value : undefined;
    },
    set: (key: string, value: V): void => {
      const time = now();
      for (const [entryKey, entry] of entries) {
        if (entry.expiresAt <= time) {
          entries.delete(entryKey);
        }
      }
      entries.set(key, { value, expiresAt: time + ttlMs });
    },
    /** Removes `key` when it still holds `value`. */
    release: (key: string, value: V): void => {
      if (entries.get(key)?.value === value) {
        entries.delete(key);
      }
    },
  };
};

/** The wallet holds a fee-funding transaction for another mint. */
export class OtherMintPendingError extends Error {
  constructor() {
    super(
      "This wallet has a pending fee-funding transaction for another mint. Try again in a minute."
    );
    this.name = "OtherMintPendingError";
  }
}

/**
 * Signs one fee-funding transaction per wallet at a time. For `FUND_FEES_HOLD_MS` from a wallet's
 * request, a request for the same mint gets the same transaction, built once, and a request for
 * another mint is refused with `OtherMintPendingError`. The wallet is held from before the build
 * starts, so concurrent requests share one build. A failed build releases the wallet.
 */
export const fundFeesStore = (now: Clock) => {
  const held = expiringMap<{ mint: string; transaction: Promise<Uint8Array> }>(
    FUND_FEES_HOLD_MS,
    now
  );
  return async (
    request: { wallet: string; mint: string },
    build: () => Promise<Uint8Array>
  ): Promise<Uint8Array> => {
    const pending = held.get(request.wallet);
    if (pending) {
      if (pending.mint !== request.mint) {
        throw new OtherMintPendingError();
      }
      return pending.transaction;
    }
    const entry = { mint: request.mint, transaction: build() };
    held.set(request.wallet, entry);
    entry.transaction.catch(() => held.release(request.wallet, entry));
    return entry.transaction;
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
