import { EPOCH_LENGTH } from "@helium/helium-sub-daos-sdk";
import BN from "bn.js";
import { expect } from "chai";
import { describe, it } from "mocha";
import { expirationCapEpoch } from "../../src/server/api/routers/governance/procedures/helpers/build-claim-instructions";

const epochStart = (epoch: number) => new BN(epoch).mul(new BN(EPOCH_LENGTH));

describe("expirationCapEpoch", () => {
  it("does not cap when there is no expiration", () => {
    expect(expirationCapEpoch(new BN(0))).to.eq(Number.MAX_SAFE_INTEGER);
  });

  it("includes the epoch containing a mid-epoch expiration", () => {
    // Expiration mid-epoch 50: epoch 50 still pays, so the exclusive end
    // bound is 51 and the last claimed epoch is 50.
    expect(expirationCapEpoch(epochStart(50).add(new BN(10)))).to.eq(51);
  });

  it("excludes the epoch when expiration falls exactly on its start", () => {
    // Expiration at the start of epoch 50 means epoch 50 pays zero; epoch 49
    // is the last paying epoch, so the exclusive end bound is 50.
    expect(expirationCapEpoch(epochStart(50))).to.eq(50);
  });
});
