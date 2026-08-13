import { expect } from "chai";
import { describe, it } from "mocha";
import { isClientCraftedBundleTag } from "../../src/lib/utils/submission-helpers";

describe("isClientCraftedBundleTag", () => {
  it("matches claim-rewards tags from wallet-app", () => {
    expect(isClientCraftedBundleTag("claim-rewards")).to.equal(true);
    expect(isClientCraftedBundleTag("claim-rewards-iot")).to.equal(true);
  });

  it("matches implicit-burn tags from older wallet-app releases", () => {
    expect(isClientCraftedBundleTag("implicit-burn-abc123")).to.equal(true);
  });

  it("does not match server-crafted tags", () => {
    expect(isClientCraftedBundleTag("claim_rewards_tuktuk:wallet")).to.equal(
      false,
    );
    expect(isClientCraftedBundleTag("treasury-swap-abc")).to.equal(false);
  });

  it("returns false for an absent tag", () => {
    expect(isClientCraftedBundleTag(undefined)).to.equal(false);
  });
});
