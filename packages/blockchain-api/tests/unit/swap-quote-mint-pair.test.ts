import { GetQuoteInputSchema } from "@helium/blockchain-api";
import { expect } from "chai";
import { describe, it } from "mocha";

const HNT = "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux";
const SOL = "So11111111111111111111111111111111111111112";

const quoteInput = (inputMint: string, outputMint: string) => ({
  inputMint,
  outputMint,
  amount: "100000000",
});

describe("GetQuoteInputSchema mint pair", () => {
  it("rejects a quote whose input and output mint are the same", () => {
    // Jupiter answers this with CIRCULAR_ARBITRAGE_IS_DISABLED; rejecting it
    // here keeps it a 400 instead of a JUPITER_ERROR 500.
    const result = GetQuoteInputSchema.safeParse(quoteInput(HNT, HNT));

    expect(result.success).to.be.false;
    expect(result.error?.issues.map((issue) => issue.message)).to.include(
      "inputMint and outputMint must be different"
    );
  });

  it("accepts a quote between two different mints", () => {
    expect(GetQuoteInputSchema.safeParse(quoteInput(HNT, SOL)).success).to.be
      .true;
  });
});
