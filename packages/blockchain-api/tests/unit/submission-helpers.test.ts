import { expect } from "chai";
import { describe, it } from "mocha";
import {
  isBundleLanded,
  predictSubmissionType,
  type MinimalSignatureStatus,
} from "../../src/lib/utils/submission-helpers";

const confirmed: MinimalSignatureStatus = {
  err: null,
  confirmationStatus: "confirmed",
};
const finalized: MinimalSignatureStatus = {
  err: null,
  confirmationStatus: "finalized",
};
const processed: MinimalSignatureStatus = {
  err: null,
  confirmationStatus: "processed",
};
const failed: MinimalSignatureStatus = {
  err: { InstructionError: [0, "Custom"] },
  confirmationStatus: "confirmed",
};

const tipMeta = { type: "jito_tip" };
const claimMeta = { type: "claim_rewards" };

describe("isBundleLanded", () => {
  it("returns true when all real transactions are confirmed", () => {
    expect(
      isBundleLanded([confirmed, confirmed], [claimMeta, claimMeta]),
    ).to.equal(true);
  });

  it("treats finalized as landed", () => {
    expect(isBundleLanded([finalized], [claimMeta])).to.equal(true);
  });

  it("ignores the tip transaction's status", () => {
    // Real txs landed; tip not found (null) — still landed.
    expect(
      isBundleLanded(
        [confirmed, confirmed, null],
        [claimMeta, claimMeta, tipMeta],
      ),
    ).to.equal(true);
  });

  it("returns false when a real transaction is not found (null)", () => {
    expect(isBundleLanded([confirmed, null], [claimMeta, claimMeta])).to.equal(
      false,
    );
  });

  it("returns false when a real transaction has an error", () => {
    expect(
      isBundleLanded([confirmed, failed], [claimMeta, claimMeta]),
    ).to.equal(false);
  });

  it("returns false when only processed (not yet confirmed)", () => {
    expect(isBundleLanded([processed], [claimMeta])).to.equal(false);
  });

  it("does not let a landed tip mask an unlanded real transaction", () => {
    // Tip finalized, real tx missing — must be false.
    expect(isBundleLanded([null, finalized], [claimMeta, tipMeta])).to.equal(
      false,
    );
  });

  it("checks all transactions when metadata is absent", () => {
    expect(isBundleLanded([confirmed, confirmed])).to.equal(true);
    expect(isBundleLanded([confirmed, null])).to.equal(false);
  });

  it("returns false for an empty status list", () => {
    expect(isBundleLanded([])).to.equal(false);
  });
});

describe("predictSubmissionType", () => {
  it("returns 'single' for a single transaction regardless of other flags", () => {
    expect(
      predictSubmissionType({
        transactionCount: 1,
        useJitoBundle: true,
        parallel: true,
      }),
    ).to.equal("single");
  });

  it("returns 'jito_bundle' for multiple transactions when Jito is used", () => {
    expect(
      predictSubmissionType({
        transactionCount: 3,
        useJitoBundle: true,
        parallel: false,
      }),
    ).to.equal("jito_bundle");
  });

  it("returns 'parallel' for multiple non-Jito parallel transactions", () => {
    expect(
      predictSubmissionType({
        transactionCount: 2,
        useJitoBundle: false,
        parallel: true,
      }),
    ).to.equal("parallel");
  });

  it("returns 'sequential' for multiple non-Jito sequential transactions", () => {
    expect(
      predictSubmissionType({
        transactionCount: 2,
        useJitoBundle: false,
        parallel: false,
      }),
    ).to.equal("sequential");
  });
});
