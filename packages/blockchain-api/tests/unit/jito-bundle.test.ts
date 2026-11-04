import { expect } from "chai";
import { describe, it } from "mocha";
import {
  MAX_JITO_BUNDLE_TXS,
  maxPackedTxs,
  shouldUseJitoBundle,
} from "../../src/lib/utils/jito-bundle";

describe("maxPackedTxs", () => {
  it("keeps one bundle slot free for the tip on a Jito cluster", () => {
    expect(maxPackedTxs("mainnet")).to.equal(4);
    expect(maxPackedTxs("mainnet-beta")).to.equal(4);
  });

  it("uses the whole bundle limit off a Jito cluster", () => {
    expect(maxPackedTxs("devnet")).to.equal(5);
  });

  it("fits a full mainnet page plus its tip within the bundle limit", () => {
    expect(maxPackedTxs("mainnet") + 1).to.equal(MAX_JITO_BUNDLE_TXS);
  });
});

describe("shouldUseJitoBundle", () => {
  it("bundles more than one tx on mainnet only", () => {
    expect(shouldUseJitoBundle(1, "mainnet")).to.equal(false);
    expect(shouldUseJitoBundle(2, "mainnet")).to.equal(true);
    expect(shouldUseJitoBundle(4, "devnet")).to.equal(false);
  });
});
