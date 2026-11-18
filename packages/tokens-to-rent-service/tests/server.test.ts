import assert from "node:assert/strict";
import { Keypair, PublicKey } from "@solana/web3.js";
import { HNT_MINT, IOT_MINT, MOBILE_MINT } from "@helium/spl-utils";
import { SignatureLimitError, UpstreamError } from "../src/errors";
import { buildServer } from "../src/server";

const RPC_URL = "https://rpc.example.com/v1/abc123";
const WALLET = Keypair.generate().publicKey.toBase58();
const HNT = HNT_MINT.toBase58();

/** A server over the given estimate and fundFees, answering HNT with "1000" and [1, 2, 3]. */
const serve = (
  overrides: {
    estimate?: (args: { mint: PublicKey }) => Promise<string>;
    fundFees?: (args: {
      userWallet: PublicKey;
      mint: PublicKey;
    }) => Promise<Uint8Array>;
  } = {}
) =>
  buildServer({
    estimate: overrides.estimate ?? (async () => "1000"),
    fundFees: overrides.fundFees ?? (async () => Uint8Array.from([1, 2, 3])),
  });

describe("buildServer", () => {
  let providerUrl: string | undefined;
  before(() => {
    providerUrl = process.env.ANCHOR_PROVIDER_URL;
    process.env.ANCHOR_PROVIDER_URL = RPC_URL;
  });
  after(() => {
    if (providerUrl === undefined) {
      delete process.env.ANCHOR_PROVIDER_URL;
    } else {
      process.env.ANCHOR_PROVIDER_URL = providerUrl;
    }
  });

  it("answers /health", async () => {
    const res = await serve().inject({ method: "GET", url: "/health" });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { ok: true });
  });

  describe("/estimate", () => {
    it("answers the mint's estimate", async () => {
      const asked: string[] = [];
      const res = await serve({
        estimate: async ({ mint }) => {
          asked.push(mint.toBase58());
          return "1000";
        },
      }).inject({ method: "POST", url: "/estimate", payload: { mint: HNT } });

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.json(), { estimate: "1000" });
      assert.deepEqual(asked, [HNT]);
    });

    it("answers 400 for a mint that is not a public key", async () => {
      const res = await serve().inject({
        method: "POST",
        url: "/estimate",
        payload: { mint: "not-a-key" },
      });

      assert.equal(res.statusCode, 400);
      assert.match(res.json().error, /mint/);
    });

    it("answers 400 for a body without a mint", async () => {
      const res = await serve().inject({
        method: "POST",
        url: "/estimate",
        payload: {},
      });

      assert.equal(res.statusCode, 400);
    });

    it("answers 400 for a mint the service does not swap, before it estimates", async () => {
      const mint = Keypair.generate().publicKey.toBase58();
      let estimates = 0;
      const res = await serve({
        estimate: async () => {
          estimates += 1;
          return "1000";
        },
      }).inject({ method: "POST", url: "/estimate", payload: { mint } });

      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.json(), {
        error: `Provided mint not supported by service: ${mint}`,
      });
      assert.equal(estimates, 0);
    });

    it("answers 502 with the redacted error when Jupiter's answer is refused", async () => {
      const res = await serve({
        estimate: async () => {
          throw new UpstreamError(`Jupiter /build error via ${RPC_URL}`);
        },
      }).inject({ method: "POST", url: "/estimate", payload: { mint: HNT } });

      assert.equal(res.statusCode, 502);
      assert.deepEqual(res.json(), {
        error: "Jupiter /build error via [redacted]",
      });
    });
  });

  describe("/fees", () => {
    it("answers 429 when the instance has signed its limit for the minute", async () => {
      const res = await serve({
        fundFees: async () => {
          throw new SignatureLimitError();
        },
      }).inject({
        method: "POST",
        url: "/fees",
        payload: { wallet: WALLET, mint: HNT },
      });

      assert.equal(res.statusCode, 429);
      assert.match(res.json().error, /limit of fee-funding transactions/);
    });

    it("answers the signed transaction's bytes", async () => {
      const asked: string[][] = [];
      const res = await serve({
        fundFees: async ({ userWallet, mint }) => {
          asked.push([userWallet.toBase58(), mint.toBase58()]);
          return Uint8Array.from([1, 2, 3]);
        },
      }).inject({
        method: "POST",
        url: "/fees",
        payload: { wallet: WALLET, mint: HNT },
      });

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.json(), [1, 2, 3]);
      assert.deepEqual(asked, [[WALLET, HNT]]);
    });

    it("answers 400 for a wallet that is not a public key", async () => {
      const res = await serve().inject({
        method: "POST",
        url: "/fees",
        payload: { wallet: "not-a-key", mint: HNT },
      });

      assert.equal(res.statusCode, 400);
      assert.match(res.json().error, /wallet/);
    });

    it("answers 400 fast for a 100,000-character wallet, without repeating it", async () => {
      const wallet = "2".repeat(100_000);
      const logged: unknown[] = [];
      const consoleError = console.error;
      console.error = (...args: unknown[]) => {
        logged.push(...args);
      };
      const started = Date.now();
      let res;
      try {
        res = await serve().inject({
          method: "POST",
          url: "/fees",
          payload: { wallet, mint: HNT },
        });
      } finally {
        console.error = consoleError;
      }
      const elapsed = Date.now() - started;

      assert.equal(res.statusCode, 400);
      assert.ok(elapsed < 200, `took ${elapsed} ms`);
      assert.deepEqual(res.json(), { error: "Invalid wallet" });
      assert.equal(res.body.includes(wallet), false);
      assert.equal(logged.join(" ").includes(wallet), false);
    });

    it("answers 400 for a 45-character wallet", async () => {
      const res = await serve().inject({
        method: "POST",
        url: "/fees",
        payload: { wallet: "1".repeat(45), mint: HNT },
      });

      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.json(), { error: "Invalid wallet" });
    });

    it("answers 400 for a mint the service does not swap, before it builds", async () => {
      let builds = 0;
      const res = await serve({
        fundFees: async () => {
          builds += 1;
          return Uint8Array.from([1]);
        },
      }).inject({
        method: "POST",
        url: "/fees",
        payload: {
          wallet: WALLET,
          mint: Keypair.generate().publicKey.toBase58(),
        },
      });

      assert.equal(res.statusCode, 400);
      assert.match(res.json().error, /Provided mint not supported by service/);
      assert.equal(builds, 0);
    });

    it("answers 500 with the redacted error for any other failure", async () => {
      const res = await serve({
        fundFees: async () => {
          throw new Error(`connect to ${RPC_URL} refused`);
        },
      }).inject({
        method: "POST",
        url: "/fees",
        payload: { wallet: WALLET, mint: HNT },
      });

      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.json(), { error: "connect to [redacted] refused" });
    });
  });

  describe("/estimates", () => {
    it("answers the estimates that resolved when another fails", async () => {
      const res = await serve({
        estimate: async ({ mint }) => {
          if (mint.equals(IOT_MINT)) {
            throw new UpstreamError("Jupiter priced the sale at 0 SOL");
          }
          return mint.equals(HNT_MINT) ? "1000" : "2000";
        },
      }).inject({ method: "GET", url: "/estimates" });

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.json(), {
        [HNT]: "1000",
        [MOBILE_MINT.toBase58()]: "2000",
      });
    });

    it("answers the first failure's status and redacted error when every estimate fails", async () => {
      const res = await serve({
        estimate: async () => {
          throw new UpstreamError(`Jupiter /build error via ${RPC_URL}`);
        },
      }).inject({ method: "GET", url: "/estimates" });

      assert.equal(res.statusCode, 502);
      assert.deepEqual(res.json(), {
        error: "Jupiter /build error via [redacted]",
      });
    });
  });
});
