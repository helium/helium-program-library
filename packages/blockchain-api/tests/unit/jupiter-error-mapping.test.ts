import { expect } from "chai";
import { describe, it } from "mocha";
import { classifyJupiterError } from "../../src/lib/utils/jupiter-errors";

describe("classifyJupiterError", () => {
  it("maps a circular arbitrage refusal to a bad request", () => {
    const classification = classifyJupiterError({
      status: 400,
      body: '{"error":"Circular arbitrage is disabled","errorCode":"CIRCULAR_ARBITRAGE_IS_DISABLED"}',
      operation: "Failed to get quote from Jupiter",
    });

    expect(classification).to.deep.equal({
      kind: "BAD_REQUEST",
      message: "Input and output mints must be different",
    });
  });

  it("maps a non-tradable token to a bad request", () => {
    const classification = classifyJupiterError({
      status: 400,
      body: '{"errorCode":"TOKEN_NOT_TRADABLE"}',
      operation: "Failed to get quote from Jupiter",
    });

    expect(classification).to.deep.equal({
      kind: "BAD_REQUEST",
      message: "Token is not tradable",
    });
  });

  it("maps Jupiter rate limiting to a rate-limited result", () => {
    const classification = classifyJupiterError({
      status: 429,
      body: "Too many requests",
      operation: "Failed to get quote from Jupiter",
    });

    expect(classification).to.deep.equal({ kind: "RATE_LIMITED" });
  });

  it("keeps a rate-limited response rate-limited even when it echoes a client error code", () => {
    const classification = classifyJupiterError({
      status: 429,
      body: '{"errorCode":"TOKEN_NOT_TRADABLE"}',
      operation: "Failed to get quote from Jupiter",
    });

    expect(classification).to.deep.equal({ kind: "RATE_LIMITED" });
  });

  it("reports an upstream failure whose body merely mentions a code as a Jupiter error", () => {
    const classification = classifyJupiterError({
      status: 502,
      body: "upstream refused request for CIRCULAR_ARBITRAGE_IS_DISABLED",
      operation: "Failed to get quote from Jupiter",
    });

    expect(classification).to.deep.equal({
      kind: "JUPITER_ERROR",
      message:
        "Failed to get quote from Jupiter: HTTP 502: upstream refused request for CIRCULAR_ARBITRAGE_IS_DISABLED",
    });
  });

  it("reports an unrecognized failure as a Jupiter error carrying the status", () => {
    const classification = classifyJupiterError({
      status: 502,
      body: "upstream unavailable",
      operation: "Failed to get swap instructions from Jupiter",
    });

    expect(classification).to.deep.equal({
      kind: "JUPITER_ERROR",
      message:
        "Failed to get swap instructions from Jupiter: HTTP 502: upstream unavailable",
    });
  });

  it("truncates a long failure body", () => {
    const classification = classifyJupiterError({
      status: 500,
      body: "x".repeat(600),
      operation: "Failed to get quote from Jupiter",
    });

    expect(classification).to.deep.equal({
      kind: "JUPITER_ERROR",
      message: `Failed to get quote from Jupiter: HTTP 500: ${"x".repeat(500)}`,
    });
  });
});
