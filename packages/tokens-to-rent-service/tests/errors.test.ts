import assert from "node:assert/strict";
import { failure, redact, RequestError, UpstreamError } from "../src/errors";
import { OtherMintPendingError } from "../src/reuse";

const RPC_URL = "https://rpc.example.com/v1/abc123?api-key=def456";
const ENV = {
  ANCHOR_PROVIDER_URL: RPC_URL,
  JUPITER_API_KEY: "jup-key-789",
};

describe("redact", () => {
  it("removes the RPC URL", () => {
    assert.equal(
      redact(`request to ${RPC_URL} failed`, ENV),
      "request to [redacted] failed"
    );
  });

  it("removes the RPC URL in its normal form", () => {
    assert.equal(
      redact("request to https://rpc.example.com/ failed", {
        ANCHOR_PROVIDER_URL: "https://rpc.example.com",
      }),
      "request to [redacted] failed"
    );
  });

  it("removes the RPC host with its path and query", () => {
    assert.equal(
      redact("POST rpc.example.com/v1/abc123?api-key=def456 502", ENV),
      "POST [redacted] 502"
    );
  });

  it("removes the RPC host", () => {
    assert.equal(
      redact("getaddrinfo ENOTFOUND rpc.example.com", ENV),
      "getaddrinfo ENOTFOUND [redacted]"
    );
  });

  it("removes the RPC host and its port", () => {
    const env = { ANCHOR_PROVIDER_URL: "http://rpc.example.com:8899/abc123" };
    assert.equal(
      redact("connect ECONNREFUSED rpc.example.com:8899", env),
      "connect ECONNREFUSED [redacted]"
    );
    assert.equal(
      redact("getaddrinfo ENOTFOUND rpc.example.com", env),
      "getaddrinfo ENOTFOUND [redacted]"
    );
  });

  it("removes an RPC URL that does not parse as it is written", () => {
    assert.equal(
      redact("Invalid URL: rpc.example.com/abc123", {
        ANCHOR_PROVIDER_URL: "rpc.example.com/abc123",
      }),
      "Invalid URL: [redacted]"
    );
  });

  it("removes the Jupiter API key", () => {
    assert.equal(
      redact("x-api-key jup-key-789 was refused", ENV),
      "x-api-key [redacted] was refused"
    );
  });

  it("removes each one more than once", () => {
    assert.equal(
      redact(`${RPC_URL} jup-key-789 ${RPC_URL} jup-key-789`, ENV),
      "[redacted] [redacted] [redacted] [redacted]"
    );
  });

  it("returns a text with nothing to remove as it is", () => {
    assert.equal(
      redact("Jupiter has no route for this swap", ENV),
      "Jupiter has no route for this swap"
    );
  });

  it("returns the text as it is when the environment sets neither", () => {
    assert.equal(redact("no route", {}), "no route");
    assert.equal(
      redact("no route", { ANCHOR_PROVIDER_URL: "", JUPITER_API_KEY: "" }),
      "no route"
    );
  });
});

describe("failure", () => {
  it("answers 429 when the wallet holds a transaction for another mint", () => {
    const { status, body } = failure(new OtherMintPendingError(), ENV);

    assert.equal(status, 429);
    assert.deepEqual(body, {
      error:
        "This wallet has a pending fee-funding transaction for another mint. Try again in a minute.",
    });
  });

  it("answers 400 with the redacted message when the request is wrong", () => {
    const { status, body } = failure(
      new RequestError(`Invalid mint: ${RPC_URL}`),
      ENV
    );

    assert.equal(status, 400);
    assert.deepEqual(body, { error: "Invalid mint: [redacted]" });
  });

  it("answers 502 with the redacted message when Jupiter's answer is refused", () => {
    const { status, body } = failure(
      new UpstreamError("Jupiter /build error: 401 for jup-key-789"),
      ENV
    );

    assert.equal(status, 502);
    assert.deepEqual(body, {
      error: "Jupiter /build error: 401 for [redacted]",
    });
  });

  it("answers 500 with the redacted message for any other error", () => {
    const { status, body } = failure(
      new Error(`request to ${RPC_URL} failed with key jup-key-789`),
      ENV
    );

    assert.equal(status, 500);
    assert.deepEqual(body, {
      error: "request to [redacted] failed with key [redacted]",
    });
  });

  it("answers 500 for a value that is not an error", () => {
    const { status, body } = failure(`${RPC_URL} is down`, ENV);

    assert.equal(status, 500);
    assert.deepEqual(body, { error: "[redacted] is down" });
  });

  it("gives a redacted log text that keeps the stack and the cause", () => {
    const err = Object.assign(new Error("fetch failed for jup-key-789"), {
      cause: new Error(`connect to ${RPC_URL} refused`),
    });

    const { log } = failure(err, ENV);

    assert.match(log, /^Error: fetch failed for \[redacted\]\n\s+at /);
    assert.match(log, /cause\]?: Error: connect to \[redacted\] refused/);
    assert.equal(log.includes("rpc.example.com"), false);
    assert.equal(log.includes("def456"), false);
    assert.equal(log.includes("jup-key-789"), false);
  });
});
