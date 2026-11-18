import assert from "node:assert/strict";
import { estimateCache, expiringMap, fundFeesStore } from "../src/reuse";

/** A clock the test moves by hand. */
const clock = () => {
  let time = 1_000_000;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
};

/** A promise the test settles by hand. */
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("expiringMap", () => {
  it("removes the expired entries when another key is set", () => {
    const { now, advance } = clock();
    const map = expiringMap<number>(1_000, now);

    map.set("a", 1);
    map.set("b", 2);
    advance(1_000);
    map.set("c", 3);

    assert.equal(map.size, 1);
    assert.equal(map.get("c"), 3);
  });
});

describe("fundFeesStore", () => {
  const WALLET = "wallet";
  const HNT = "hnt";
  const IOT = "iot";
  /** A build that signs a new transaction on each call: `[1]`, then `[2]`. */
  const building = () => {
    let builds = 0;
    return {
      build: async () => Uint8Array.from([++builds]),
      count: () => builds,
    };
  };

  it("returns the same signed transaction for the same wallet and mint, and builds once", async () => {
    const { now, advance } = clock();
    const signOnce = fundFeesStore(now);
    const { build, count } = building();

    const first = await signOnce({ wallet: WALLET, mint: HNT }, build);
    advance(89_999);
    const second = await signOnce({ wallet: WALLET, mint: HNT }, build);

    assert.deepEqual([...first], [1]);
    assert.deepEqual([...second], [1]);
    assert.equal(count(), 1);
  });

  it("holds the transaction for 90 seconds from when its build resolves", async () => {
    const { now, advance } = clock();
    const signOnce = fundFeesStore(now);
    const signing = deferred<Uint8Array>();
    let builds = 0;
    const build = () => {
      builds += 1;
      return builds === 1
        ? signing.promise
        : Promise.resolve(Uint8Array.from([2]));
    };

    const first = signOnce({ wallet: WALLET, mint: HNT }, build);
    advance(5_000);
    signing.resolve(Uint8Array.from([1]));
    assert.deepEqual([...(await first)], [1]);

    advance(55_000);
    const atRequestPlus60 = await signOnce(
      { wallet: WALLET, mint: HNT },
      build
    );
    advance(34_999);
    const atResolvePlus89999 = await signOnce(
      { wallet: WALLET, mint: HNT },
      build
    );
    advance(1);
    const atResolvePlus90 = await signOnce(
      { wallet: WALLET, mint: HNT },
      build
    );

    assert.deepEqual([...atRequestPlus60], [1]);
    assert.deepEqual([...atResolvePlus89999], [1]);
    assert.deepEqual([...atResolvePlus90], [2]);
    assert.equal(builds, 2);
  });

  it("holds a build in flight past the hold time, through a sweep", async () => {
    const { now, advance } = clock();
    const signOnce = fundFeesStore(now);
    const signing = deferred<Uint8Array>();
    let builds = 0;
    const build = () => {
      builds += 1;
      return signing.promise;
    };

    const first = signOnce({ wallet: WALLET, mint: HNT }, build);
    advance(200_000);
    await signOnce({ wallet: "other", mint: HNT }, async () =>
      Uint8Array.from([9])
    );
    const second = signOnce({ wallet: WALLET, mint: HNT }, build);
    signing.resolve(Uint8Array.from([7]));

    assert.deepEqual([...(await first)], [7]);
    assert.deepEqual([...(await second)], [7]);
    assert.equal(builds, 1);
  });

  it("builds and returns a transaction for each mint of a wallet", async () => {
    const signOnce = fundFeesStore(clock().now);
    const { build, count } = building();

    const hnt = await signOnce({ wallet: WALLET, mint: HNT }, build);
    const iot = await signOnce({ wallet: WALLET, mint: IOT }, build);

    assert.deepEqual([...hnt], [1]);
    assert.deepEqual([...iot], [2]);
    assert.equal(count(), 2);
  });

  it("holds each wallet apart", async () => {
    const signOnce = fundFeesStore(clock().now);
    const { build } = building();

    await signOnce({ wallet: WALLET, mint: HNT }, build);
    const other = await signOnce({ wallet: "other", mint: HNT }, build);

    assert.deepEqual([...other], [2]);
  });

  it("shares one build between concurrent requests for a wallet and mint", async () => {
    const signOnce = fundFeesStore(clock().now);
    const signing = deferred<Uint8Array>();
    let builds = 0;
    const build = () => {
      builds += 1;
      return signing.promise;
    };

    const first = signOnce({ wallet: WALLET, mint: HNT }, build);
    const second = signOnce({ wallet: WALLET, mint: HNT }, build);
    signing.resolve(Uint8Array.from([7]));

    assert.deepEqual([...(await first)], [7]);
    assert.deepEqual([...(await second)], [7]);
    assert.equal(builds, 1);
  });

  it("releases the wallet and mint when its build fails", async () => {
    const signOnce = fundFeesStore(clock().now);
    const { build } = building();

    await assert.rejects(
      signOnce({ wallet: WALLET, mint: HNT }, async () => {
        throw new Error("no route");
      }),
      /no route/
    );
    const next = await signOnce({ wallet: WALLET, mint: HNT }, build);

    assert.deepEqual([...next], [1]);
  });
});

describe("estimateCache", () => {
  const HNT = "hnt";
  const IOT = "iot";
  /** A load that returns a new estimate on each call: `"1"`, then `"2"`. */
  const loading = () => {
    let loads = 0;
    return {
      load: async () => (++loads).toString(),
      count: () => loads,
    };
  };

  it("returns a mint's estimate for 15 seconds without a new load", async () => {
    const { now, advance } = clock();
    const cached = estimateCache(now);
    const { load, count } = loading();

    const first = await cached(HNT, load);
    advance(14_999);
    const second = await cached(HNT, load);

    assert.equal(first, "1");
    assert.equal(second, "1");
    assert.equal(count(), 1);
  });

  it("loads again 15 seconds after the estimate was loaded", async () => {
    const { now, advance } = clock();
    const cached = estimateCache(now);
    const { load, count } = loading();

    await cached(HNT, load);
    advance(15_000);
    const second = await cached(HNT, load);

    assert.equal(second, "2");
    assert.equal(count(), 2);
  });

  it("holds each mint apart", async () => {
    const cached = estimateCache(clock().now);
    const { load } = loading();

    await cached(HNT, load);
    const other = await cached(IOT, load);

    assert.equal(other, "2");
  });

  it("does not keep a failed load", async () => {
    const cached = estimateCache(clock().now);
    const { load } = loading();

    await assert.rejects(
      cached(HNT, async () => {
        throw new Error("no route");
      }),
      /no route/
    );
    const next = await cached(HNT, load);

    assert.equal(next, "1");
  });

  it("shares one load between concurrent callers", async () => {
    const cached = estimateCache(clock().now);
    const quote = deferred<string>();
    let loads = 0;
    const load = () => {
      loads += 1;
      return quote.promise;
    };

    const first = cached(HNT, load);
    const second = cached(HNT, load);
    quote.resolve("9");

    assert.equal(await first, "9");
    assert.equal(await second, "9");
    assert.equal(loads, 1);
  });
});
