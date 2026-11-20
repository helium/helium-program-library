import { expect } from "chai";
import { before, describe, it } from "mocha";

/**
 * Type-only, so naming the module here does not import it: it reads a
 * validated env at load, which only exists once `before` has set one up.
 */
type BuildTransactionModule =
  typeof import("../../src/lib/utils/build-transaction");

describe("shortVecSize", () => {
  let shortVecSize: BuildTransactionModule["shortVecSize"];

  before(async () => {
    // Every server variable the env schema requires without a default.
    process.env.PG_USER = "test";
    process.env.PG_NAME = "test";
    process.env.PG_HOST = "localhost";
    process.env.PG_PORT = "5432";
    process.env.JUPITER_API_KEY = "test";
    process.env.NO_PG = "true";
    ({ shortVecSize } = await import("../../src/lib/utils/build-transaction"));
  });

  for (const [n, size] of [
    [0, 1],
    [127, 1],
    [128, 2],
    [16383, 2],
    [16384, 3],
  ]) {
    it(`takes ${size} byte(s) for a length of ${n}`, () => {
      expect(shortVecSize(n)).to.eq(size);
    });
  }
});
