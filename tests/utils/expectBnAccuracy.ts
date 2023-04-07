import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";

export const expectBnAccuracy = (
  expectedBn: anchor.BN,
  actualBn: anchor.BN,
  percentUncertainty: number
) => {
  let bigIntExpected = BigInt(expectedBn.toString());
  let bigIntActual = BigInt(actualBn.toString());

  let upperBound = Number(bigIntExpected) * (1 + percentUncertainty);
  let lowerBound = Number(bigIntExpected) * (1 - percentUncertainty);

  try {
    expect(upperBound >= Number(bigIntActual)).to.be.true;
    expect(lowerBound <= Number(bigIntActual)).to.be.true;
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
