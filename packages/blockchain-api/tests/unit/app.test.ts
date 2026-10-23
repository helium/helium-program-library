import { expect } from "chai";
import type { FastifyInstance } from "fastify";
import { Keypair } from "@solana/web3.js";
import { inspect } from "node:util";

describe("buildApp", () => {
  let app: FastifyInstance;

  before(async () => {
    process.env.PG_USER = "test";
    process.env.PG_NAME = "test";
    process.env.PG_HOST = "localhost";
    process.env.PG_PORT = "5432";
    process.env.JUPITER_API_KEY = "test";
    process.env.NO_PG = "true";
    const { buildApp } = await import("../../src/app");
    app = await buildApp();
  });

  after(async () => {
    await app.close();
  });

  it("serves the REST health check", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(res.statusCode).to.equal(200);
    expect(res.headers["content-type"]).to.match(/application\/json/);
    expect(res.json()).to.have.property("ok");
  });

  it("serves the OpenAPI reference page", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/docs" });
    expect(res.statusCode).to.equal(200);
    expect(res.headers["content-type"]).to.match(/text\/html/);
  });

  it("answers an RPC call", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/rpc/health/check",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ json: {} }),
    });
    expect(res.statusCode).to.equal(200);
    expect(res.json().json).to.have.property("ok");
  });

  it("answers a preflight from an allowed origin", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/rpc/health/check",
      headers: {
        origin: "https://app.helium.io",
        "access-control-request-method": "POST",
      },
    });
    expect(res.statusCode).to.equal(204);
    expect(res.headers["access-control-allow-origin"]).to.equal(
      "https://app.helium.io",
    );
    expect(res.headers["access-control-allow-credentials"]).to.equal("true");
    expect(res.headers["access-control-allow-methods"]).to.equal(
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    expect(res.headers["access-control-allow-headers"]).to.equal(
      "Content-Type, Authorization",
    );
    expect(res.headers["access-control-max-age"]).to.equal("86400");
  });

  it("withholds the allow-origin header from an unknown origin", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/rpc/health/check",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "POST",
      },
    });
    expect(res.statusCode).to.equal(204);
    expect(res.headers).to.not.have.property("access-control-allow-origin");
  });

  it("answers an OPTIONS request that is not a well-formed preflight", async () => {
    const res = await app.inject({ method: "OPTIONS", url: "/api/v1/health" });
    expect(res.statusCode).to.equal(204);
  });

  it("reflects an allowed origin on a normal request", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/health",
      headers: { origin: "https://heliumvote.com" },
    });
    expect(res.headers["access-control-allow-origin"]).to.equal(
      "https://heliumvote.com",
    );
    expect(res.headers["access-control-allow-credentials"]).to.equal("true");
  });

  it("returns Fastify's JSON 404 for unknown paths", async () => {
    for (const url of ["/nope", "/rpc/nope", "/api/v1/nope"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode, url).to.equal(404);
      expect(res.json(), url).to.include({ error: "Not Found" });
    }
  });

  describe("migration rate-limit key", () => {
    // A request whose source and destination match passes the rate limiter and
    // then fails with BAD_REQUEST, so it touches no network. With one request
    // allowed per IP, a second request on the same key gets RATE_LIMITED.
    const sameWalletInput = () => {
      const wallet = Keypair.generate().publicKey.toBase58();
      return { sourceWallet: wallet, destinationWallet: wallet };
    };

    const migrate = (headers: Record<string, string>, remoteAddress?: string) =>
      app.inject({
        method: "POST",
        url: "/rpc/migration/migrate",
        headers: { "content-type": "application/json", ...headers },
        payload: JSON.stringify({ json: sameWalletInput() }),
        remoteAddress,
      });

    before(() => {
      process.env.MIGRATION_RATE_LIMIT_PER_IP = "1";
      process.env.MIGRATION_RATE_LIMIT_PER_PAIR = "0";
    });

    after(() => {
      delete process.env.MIGRATION_RATE_LIMIT_PER_IP;
      delete process.env.MIGRATION_RATE_LIMIT_PER_PAIR;
    });

    it("keys a request without x-forwarded-for on the socket address", async () => {
      // #given a request with no x-forwarded-for from socket 10.0.5.5
      const first = await migrate({}, "10.0.5.5");
      expect(first.json().json.code).to.equal("BAD_REQUEST");

      // #when a request names 10.0.5.5 as its client IP
      const second = await migrate({ "x-forwarded-for": "10.0.5.5" });

      // #then it shares the first request's budget
      expect(second.json().json.code).to.equal("RATE_LIMITED");
    });

    it("keys every batch item on the outer request's client IP", async () => {
      // #given a batch from 10.0.0.1 whose items name their own client IPs
      const item = (n: number) => ({
        url: "http://localhost/rpc/migration/migrate",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `10.0.0.${n + 1}`,
        },
        body: { json: sameWalletInput() },
      });

      // #when the batch is sent
      const res = await app.inject({
        method: "POST",
        url: "/rpc",
        headers: {
          "content-type": "application/json",
          "x-orpc-batch": "buffered",
          "x-forwarded-for": "10.0.0.1",
        },
        payload: JSON.stringify([item(1), item(2)]),
      });

      // #then both items draw on the outer IP's single-request budget
      const codes = (res.json() as { body: { json: { code: string } } }[])
        .map((r) => r.body.json.code)
        .sort();
      expect(codes).to.deep.equal(["BAD_REQUEST", "RATE_LIMITED"]);

      // #and the outer IP's budget is the one spent, as the REST route sees it
      const followUp = await app.inject({
        method: "POST",
        url: "/api/v1/migration/migrate",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "10.0.0.1",
        },
        payload: JSON.stringify(sameWalletInput()),
      });
      expect(followUp.json().code).to.equal("RATE_LIMITED");

      // #and an item's own IP keeps its budget
      const itemIp = await app.inject({
        method: "POST",
        url: "/api/v1/migration/migrate",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "10.0.0.2",
        },
        payload: JSON.stringify(sameWalletInput()),
      });
      expect(itemIp.json().code).to.equal("BAD_REQUEST");
    });
  });

  it("leaves unlisted input values out of the validation error log", async () => {
    // #given an RPC input that fails validation and carries a marker in a
    // field the log allowlist does not name
    const marker = "SECRET-MARKER-xyz";
    const logged: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(args);
    };

    try {
      // #when the procedure rejects the input
      const res = await app.inject({
        method: "POST",
        url: "/rpc/tokens/getBalances",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({
          json: { walletAddress: "not-a-wallet", note: marker },
        }),
      });
      expect(res.json().json.code).to.equal("BAD_REQUEST");
    } finally {
      console.error = originalError;
    }

    // #then the error is logged without the marker
    expect(logged).to.not.be.empty;
    for (const args of logged) {
      expect(inspect(args, { depth: null })).to.not.include(marker);
    }
  });

  it("leaves unlisted input values out of the REST validation error log", async () => {
    // #given a REST input that fails validation and carries a marker in a
    // field the log allowlist does not name
    const marker = "SECRET-MARKER-xyz";
    const logged: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(args);
    };

    try {
      // #when the procedure rejects the input
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/tokens/not-a-wallet?note=${marker}`,
      });
      expect(res.statusCode).to.equal(400);
      expect(res.json().code).to.equal("BAD_REQUEST");
    } finally {
      console.error = originalError;
    }

    // #then the error is logged without the marker
    expect(logged).to.not.be.empty;
    for (const args of logged) {
      expect(inspect(args, { depth: null })).to.not.include(marker);
    }
  });
});
