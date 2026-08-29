import { readFileSync } from "fs";
import { join } from "path";
import { expect } from "chai";
import { describe, it } from "mocha";

/**
 * The server code reached only through a Next handler, a database and a Solana
 * RPC, so a unit test cannot call it. What it can do is hold each caller to the
 * guard it is required to call: the guards are covered by their own tests, and
 * a guard nothing calls guards nothing.
 */
const API = join(__dirname, "../../src/server/api");

/** Endpoints that may only build a transaction for the cNFT's owner. */
const ASSET_OWNER_GUARDED = [
  "routers/hotspots/procedures/hotspot-cnft.ts",
  "routers/hotspots/procedures/updateHotspotInfo.ts",
  "routers/hotspots/procedures/updateRewardsDestination.ts",
  "routers/hotspots/procedures/createSplit.ts",
  "routers/hotspots/procedures/deleteSplit.ts",
  "routers/reward-contract/procedures/create.ts",
];

/** Endpoints that spend this service's own fee payer on a claim approval. */
const CLAIM_APPROVAL_GUARDED = [
  "routers/reward-contract/procedures/claim.ts",
  "routers/welcomePacks/procedures/claim.ts",
];

/**
 * Source with comments removed, so a guard named in prose does not read as a
 * guard that is called. `:` before `//` keeps a URL in a string intact.
 */
function code(relativePath: string): string {
  return readFileSync(join(API, relativePath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Where a call to `name` starts, or -1. */
function callIndex(source: string, name: string): number {
  return source.search(new RegExp(`\\b${name}\\s*\\(`));
}

describe("server code that calls a guard", () => {
  // The counts are asserted so this enumeration cannot quietly lose an entry
  // and go on passing over the endpoints it still names.
  it("covers every endpoint that has a guard to call", () => {
    expect(ASSET_OWNER_GUARDED).to.have.lengthOf(6);
    expect(CLAIM_APPROVAL_GUARDED).to.have.lengthOf(2);
  });

  for (const file of ASSET_OWNER_GUARDED) {
    it(`${file} checks the caller owns the asset`, () => {
      expect(callIndex(code(file), "assertAssetOwner")).to.be.greaterThan(-1);
    });
  }

  for (const file of CLAIM_APPROVAL_GUARDED) {
    it(`${file} verifies the approval before loading the fee payer's key`, () => {
      const source = code(file);
      const verified = callIndex(source, "verifyClaimApproval");
      const loaded = callIndex(source, "loadKeypair");

      expect(verified, "verifyClaimApproval is not called").to.be.greaterThan(
        -1
      );
      expect(loaded, "loadKeypair is not called").to.be.greaterThan(-1);
      expect(
        verified,
        "the fee payer's key is loaded before the approval is verified"
      ).to.be.lessThan(loaded);
    });
  }

  it("routers/transactions/procedures/submit.ts attributes a batch to a verified payer", () => {
    expect(
      callIndex(
        code("routers/transactions/procedures/submit.ts"),
        "verifiedFeePayer"
      )
    ).to.be.greaterThan(-1);
  });

  it("procedures.ts logs an input through the allowlist and never whole", () => {
    const source = code("procedures.ts");

    expect(callIndex(source, "summarizeProcedureInput")).to.be.greaterThan(-1);
    expect(
      source,
      "an input serialized whole puts every field it carries in the log"
    ).to.not.match(/JSON\.stringify\s*\(\s*input\b/);
  });
});
