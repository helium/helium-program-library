import { expect } from "chai";
import { describe, it } from "mocha";
import {
  decideBatchExpiry,
  deriveLastValidBlockHeight,
  type BlockhashExpiryRow,
} from "../../src/lib/utils/blockhash-expiry";

const row = (
  overrides: Partial<BlockhashExpiryRow> & { signature: string },
): BlockhashExpiryRow => ({
  blockhash: "hashA",
  lastValidBlockHeight: 300,
  ...overrides,
});

describe("decideBatchExpiry", () => {
  it("expires the batch when a transaction is past its lastValidBlockHeight", () => {
    const decision = decideBatchExpiry({
      transactions: [
        row({ signature: "sigA" }),
        row({ signature: "sigB", lastValidBlockHeight: 200 }),
      ],
      currentBlockHeight: 250,
    });

    expect(decision.expired).to.equal(true);
    expect(decision.expiredSignatures).to.deep.equal(["sigB"]);
  });

  it("keeps a batch whose transactions are all still in range", () => {
    const decision = decideBatchExpiry({
      transactions: [row({ signature: "sigA" }), row({ signature: "sigB" })],
      currentBlockHeight: 250,
    });

    expect(decision.expired).to.equal(false);
    expect(decision.expiredSignatures).to.deep.equal([]);
  });

  it("keeps a batch on the last block its blockhash is valid for", () => {
    const decision = decideBatchExpiry({
      transactions: [row({ signature: "sigA", lastValidBlockHeight: 250 })],
      currentBlockHeight: 250,
    });

    expect(decision.expired).to.equal(false);
  });

  it("expires a row that predates lastValidBlockHeight, whose lifetime cannot be checked", () => {
    const decision = decideBatchExpiry({
      transactions: [
        row({ signature: "sigA", lastValidBlockHeight: undefined }),
      ],
      currentBlockHeight: 250,
    });

    expect(decision.expired).to.equal(true);
    expect(decision.expiredSignatures).to.deep.equal(["sigA"]);
  });

  it("expires a transaction whose own blockhash the cluster no longer accepts, however long its stored lifetime says", () => {
    const decision = decideBatchExpiry({
      transactions: [row({ signature: "sigA", lastValidBlockHeight: 100_000 })],
      currentBlockHeight: 250,
      blockhashValidity: new Map([["hashA", false]]),
    });

    expect(decision.expired).to.equal(true);
    expect(decision.expiredSignatures).to.deep.equal(["sigA"]);
  });

  it("keeps a transaction whose own blockhash the cluster still accepts, however short its stored lifetime says", () => {
    const decision = decideBatchExpiry({
      transactions: [row({ signature: "sigA", lastValidBlockHeight: 1 })],
      currentBlockHeight: 250,
      blockhashValidity: new Map([["hashA", true]]),
    });

    expect(decision.expired).to.equal(false);
  });

  it("falls back to the stored lifetime for a blockhash the probe could not answer for", () => {
    const decision = decideBatchExpiry({
      transactions: [
        row({
          signature: "sigA",
          blockhash: "hashB",
          lastValidBlockHeight: 200,
        }),
      ],
      currentBlockHeight: 250,
      blockhashValidity: new Map([["hashA", true]]),
    });

    expect(decision.expired).to.equal(true);
    expect(decision.expiredSignatures).to.deep.equal(["sigA"]);
  });
});

describe("deriveLastValidBlockHeight", () => {
  it("records a lifetime for a transaction whose own blockhash the cluster still accepts", () => {
    expect(
      deriveLastValidBlockHeight({
        blockhashValid: true,
        latestLastValidBlockHeight: 400,
      }),
    ).to.equal(400);
  });

  it("records no lifetime for a transaction whose own blockhash is already dead", () => {
    expect(
      deriveLastValidBlockHeight({
        blockhashValid: false,
        latestLastValidBlockHeight: 400,
      }),
    ).to.equal(undefined);
  });
});
