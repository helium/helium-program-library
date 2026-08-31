import { expect } from "chai";
import { describe, it } from "mocha";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "../../src/lib/utils/transaction-tags";

const USER = "GZairnxHiWXk73YhsEtkGU2XnfGw3QcUsjJr8VW2R172";
const HNT_MINT = "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux";
const WSOL_MINT = "So11111111111111111111111111111111111111112";

/** The tag the swap endpoint builds for a quote and a destination. */
const swapTag = (destinationTokenAccount?: string) =>
  generateTransactionTag({
    type: TRANSACTION_TYPES.SWAP,
    userAddress: USER,
    inputMint: HNT_MINT,
    outputMint: WSOL_MINT,
    amount: "100000000",
    destinationTokenAccount,
  });

describe("swap transaction tag", () => {
  it("distinguishes two swaps that differ only in where the output lands", () => {
    const first = swapTag("8Ta7Q1zP1cTNyKLLcCG6ehAA5H6Pjq4hLpwjDNDkKTGF");
    const second = swapTag("ATGQKkmNat3N8ZXM2ChEKMNAQ45isPPfUpBrAnvX9J8R");

    expect(first).to.not.equal(second);
  });

  it("distinguishes a swap to a named destination from one to the signer's own", () => {
    expect(swapTag("8Ta7Q1zP1cTNyKLLcCG6ehAA5H6Pjq4hLpwjDNDkKTGF")).to.not.equal(
      swapTag(undefined)
    );
  });

  it("gives the same swap the same tag", () => {
    expect(swapTag("8Ta7Q1zP1cTNyKLLcCG6ehAA5H6Pjq4hLpwjDNDkKTGF")).to.equal(
      swapTag("8Ta7Q1zP1cTNyKLLcCG6ehAA5H6Pjq4hLpwjDNDkKTGF")
    );
  });
});
