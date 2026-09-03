import { expect } from "chai";
import { describe, it } from "mocha";
import { classifyBundleSimulationFailure } from "../../src/lib/utils/simulation-classifier";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const VSR_PROGRAM = "hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8";

describe("classifyBundleSimulationFailure", () => {
  it("classifies from the failing transaction, not the whole bundle", () => {
    const result = classifyBundleSimulationFailure([
      {
        err: null,
        logs: [
          `Program ${VSR_PROGRAM} invoke [1]`,
          `Program ${VSR_PROGRAM} success`,
        ],
      },
      {
        err: { InstructionError: [1, { Custom: 1 }] },
        logs: [
          `Program ${SYSTEM_PROGRAM} invoke [1]`,
          "Transfer: insufficient lamports 100, need 2039280",
          `Program ${SYSTEM_PROGRAM} failed: custom program error: 0x1`,
        ],
      },
    ]);

    expect(result.category).to.equal("insufficient_funds");
    expect(result.detail).to.equal(
      `insufficient_lamports(have=100,need=2039280,program=${SYSTEM_PROGRAM})`,
    );
    expect(result.failedTransactionIndex).to.equal(1);
    expect(result.logs).to.deep.equal([
      `Program ${SYSTEM_PROGRAM} invoke [1]`,
      "Transfer: insufficient lamports 100, need 2039280",
      `Program ${SYSTEM_PROGRAM} failed: custom program error: 0x1`,
    ]);
  });

  it("does not attribute an earlier transaction's program to a failure with no logs", () => {
    const result = classifyBundleSimulationFailure([
      {
        err: null,
        logs: [
          `Program ${VSR_PROGRAM} invoke [1]`,
          `Program ${VSR_PROGRAM} failed: custom program error: 0x1798`,
        ],
      },
      { err: { InstructionError: [0, { Custom: 1 }] }, logs: [] },
    ]);

    expect(result.category).to.equal("custom_program_error");
    expect(result.detail).to.equal("Custom(1)(program=unknown)");
    expect(result.failedTransactionIndex).to.equal(1);
    expect(result.logs).to.deep.equal([]);
  });

  it("falls back to the whole bundle when no transaction carries an error", () => {
    const result = classifyBundleSimulationFailure([
      { err: null, logs: [`Program ${VSR_PROGRAM} invoke [1]`] },
      { err: null, logs: ["BlockhashNotFound"] },
    ]);

    expect(result.category).to.equal("blockhash_not_found");
    expect(result.failedTransactionIndex).to.equal(undefined);
    expect(result.logs).to.deep.equal([
      `Program ${VSR_PROGRAM} invoke [1]`,
      "BlockhashNotFound",
    ]);
  });
});
