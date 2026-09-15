import { expect } from "chai";

// Awaits a transaction promise that must fail with the named anchor error, checking the
// error's message and program logs for the error name.
export const expectAnchorError = async (
  promise: Promise<unknown>,
  errorName: string
) => {
  let caught: any = null;
  try {
    await promise;
  } catch (e: any) {
    caught = e;
  }
  expect(caught, `expected ${errorName}, got no error`).to.not.be.null;
  expect(
    `${caught}${JSON.stringify(caught.logs ?? [])}`,
    `expected ${errorName}`
  ).to.include(errorName);
};
