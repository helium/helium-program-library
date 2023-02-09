import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";

export const expectBnAccuracy = (
  expectedBn: anchor.BN,
  actualBn: anchor.BN,
  percentUncertainty: number
) => {
  let upperBound = expectedBn.muln(1 + percentUncertainty);
  let lowerBound = expectedBn.muln(1 - percentUncertainty);
  console.log("upper", upperBound.toString());
  console.log("expected", expectedBn.toString());
  console.log("actual", actualBn.toString());
  console.log("lower", upperBound.toString());
  try {
    expect(upperBound.gte(actualBn)).to.be.true;
    expect(lowerBound.lte(actualBn)).to.be.true;
  } catch (e) {
    console.error(
      "Expected",
      expectedBn.toString(),
      "Actual",
      actualBn.toString()
    );
    throw e;
  }
};
