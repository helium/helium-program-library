import { expect } from "chai";
import { describe, it } from "mocha";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "../../src/lib/utils/transaction-tags";

const OWNER = "GZairnxHiWXk73YhsEtkGU2XnfGw3QcUsjJr8VW2R172";
const RECIPIENT = "ATGQKkmNat3N8ZXM2ChEKMNAQ45isPPfUpBrAnvX9J8R";

/** The tag the DC mint endpoint builds for an amount and a recipient. */
const mintTag = (recipient?: string) =>
  generateTransactionTag({
    type: TRANSACTION_TYPES.MINT_DATA_CREDITS,
    userAddress: OWNER,
    dcAmount: "100000",
    hntAmount: undefined,
    recipient: recipient && recipient !== OWNER ? recipient : undefined,
  });

describe("data credits mint transaction tag", () => {
  it("distinguishes two mints that differ only in where the credits land", () => {
    expect(mintTag(RECIPIENT)).to.not.equal(mintTag(undefined));
  });

  it("gives a mint to the owner's own account the tag it had without a recipient", () => {
    expect(mintTag(OWNER)).to.equal(mintTag(undefined));
  });

  it("gives the same mint the same tag", () => {
    expect(mintTag(RECIPIENT)).to.equal(mintTag(RECIPIENT));
  });
});
