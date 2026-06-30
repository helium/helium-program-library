import { expect } from "chai";
import { createTtlCache } from "../../src/lib/utils/ttl-cache";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createTtlCache", () => {
  it("coalesces concurrent calls for the same key into one fetch", async () => {
    const cache = createTtlCache<string>({ ttlMs: 1000 });
    const gate = deferred<string>();
    let fetchCalls = 0;
    const fetcher = () => {
      fetchCalls++;
      return gate.promise;
    };

    const calls = [
      cache("a", fetcher),
      cache("a", fetcher),
      cache("a", fetcher),
    ];
    gate.resolve("VALUE");
    const results = await Promise.all(calls);

    expect(fetchCalls).to.equal(1);
    expect(results).to.deep.equal(["VALUE", "VALUE", "VALUE"]);
  });

  it("serves a cached value within TTL without calling the fetcher again", async () => {
    let clock = 1000;
    const cache = createTtlCache<string>({ ttlMs: 1000, now: () => clock });
    let fetchCalls = 0;
    const fetcher = async () => {
      fetchCalls++;
      return "VALUE";
    };

    expect(await cache("a", fetcher)).to.equal("VALUE");
    clock += 500;
    expect(await cache("a", fetcher)).to.equal("VALUE");

    expect(fetchCalls).to.equal(1);
  });

  it("refetches once the cached value has expired", async () => {
    let clock = 1000;
    const cache = createTtlCache<string>({ ttlMs: 1000, now: () => clock });
    let fetchCalls = 0;
    const fetcher = async () => {
      fetchCalls++;
      return `VALUE_${fetchCalls}`;
    };

    expect(await cache("a", fetcher)).to.equal("VALUE_1");
    clock += 1001;
    expect(await cache("a", fetcher)).to.equal("VALUE_2");

    expect(fetchCalls).to.equal(2);
  });

  it("keys entries independently", async () => {
    const cache = createTtlCache<string>({ ttlMs: 1000 });

    expect(await cache("a", async () => "A")).to.equal("A");
    expect(await cache("b", async () => "B")).to.equal("B");
    // Cached, distinct values.
    expect(await cache("a", async () => "OTHER")).to.equal("A");
    expect(await cache("b", async () => "OTHER")).to.equal("B");
  });

  it("does not cache fetcher errors and retries on the next call", async () => {
    const cache = createTtlCache<string>({ ttlMs: 1000 });
    let fetchCalls = 0;
    const fetcher = async () => {
      fetchCalls++;
      if (fetchCalls === 1) throw new Error("upstream 429");
      return "VALUE";
    };

    let firstError: unknown;
    try {
      await cache("a", fetcher);
    } catch (error) {
      firstError = error;
    }
    expect(firstError).to.be.instanceOf(Error);

    // In-flight entry must be cleared so the retry actually re-fetches.
    expect(await cache("a", fetcher)).to.equal("VALUE");
    expect(fetchCalls).to.equal(2);
  });

  it("propagates the same error to all coalesced callers without extra fetches", async () => {
    const cache = createTtlCache<string>({ ttlMs: 1000 });
    const gate = deferred<string>();
    let fetchCalls = 0;
    const fetcher = () => {
      fetchCalls++;
      return gate.promise;
    };

    const calls = [
      cache("a", fetcher).catch((e) => e),
      cache("a", fetcher).catch((e) => e),
    ];
    gate.reject(new Error("upstream 429"));
    const results = await Promise.all(calls);

    expect(fetchCalls).to.equal(1);
    expect((results[0] as Error).message).to.equal("upstream 429");
    expect((results[1] as Error).message).to.equal("upstream 429");
  });

  it("evicts expired entries when maxEntries is exceeded", async () => {
    let clock = 1000;
    const cache = createTtlCache<string>({
      ttlMs: 100,
      maxEntries: 2,
      now: () => clock,
    });

    await cache("a", async () => "A");
    await cache("b", async () => "B");
    clock += 101; // a and b now expired
    // Inserting c triggers a prune since size (2) >= maxEntries (2).
    await cache("c", async () => "C");

    // a expired and should have been pruned, forcing a refetch.
    let refetched = false;
    await cache("a", async () => {
      refetched = true;
      return "A2";
    });
    expect(refetched).to.equal(true);
  });

  it("stays bounded by evicting oldest-first when entries are all fresh", async () => {
    let clock = 1000;
    const cache = createTtlCache<string>({
      ttlMs: 10_000, // long TTL: nothing expires during the test
      maxEntries: 2,
      now: () => clock,
    });

    await cache("a", async () => "A");
    clock += 1;
    await cache("b", async () => "B");
    clock += 1;
    // Inserting c is over capacity with nothing expired, so the oldest (a) is evicted.
    await cache("c", async () => "C");

    // b and c remain cached (these are hits and don't touch the write path).
    expect(await cache("b", async () => "OTHER")).to.equal("B");
    expect(await cache("c", async () => "OTHER")).to.equal("C");

    // a was evicted and must refetch.
    let aRefetched = false;
    await cache("a", async () => {
      aRefetched = true;
      return "A2";
    });
    expect(aRefetched).to.equal(true);
  });
});
