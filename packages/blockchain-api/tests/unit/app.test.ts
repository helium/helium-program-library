import { expect } from "chai";
import type { FastifyInstance } from "fastify";

describe("buildApp", () => {
  let app: FastifyInstance;

  before(async () => {
    process.env.PG_USER = "test";
    process.env.PG_NAME = "test";
    process.env.PG_HOST = "localhost";
    process.env.PG_PORT = "5432";
    process.env.PRIVY_APP_SECRET = "test";
    process.env.JUPITER_API_KEY = "test";
    process.env.PRIVY_APP_ID = "test";
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
});
