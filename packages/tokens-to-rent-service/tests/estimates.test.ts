import assert from "node:assert/strict";
import { settleEstimates } from "../src/estimates";

const MINTS = ["hnt", "mobile", "iot"];

const fulfilled = (value: string): PromiseSettledResult<string> => ({
  status: "fulfilled",
  value,
});

const rejected = (reason: unknown): PromiseSettledResult<string> => ({
  status: "rejected",
  reason,
});

describe("settleEstimates", () => {
  it("keys every estimate by its mint when all resolve", () => {
    assert.deepEqual(
      settleEstimates(MINTS, [fulfilled("1"), fulfilled("2"), fulfilled("3")]),
      {
        estimates: { hnt: "1", mobile: "2", iot: "3" },
        failures: [],
        allFailed: false,
      }
    );
  });

  it("omits a failed estimate and lists its failure", () => {
    const reason = new Error("no route");

    assert.deepEqual(
      settleEstimates(MINTS, [
        fulfilled("1"),
        rejected(reason),
        fulfilled("3"),
      ]),
      {
        estimates: { hnt: "1", iot: "3" },
        failures: [{ mint: "mobile", reason }],
        allFailed: false,
      }
    );
  });

  it("reports all failed when every estimate rejects", () => {
    const reasons = [new Error("a"), new Error("b"), new Error("c")];

    assert.deepEqual(settleEstimates(MINTS, reasons.map(rejected)), {
      estimates: {},
      failures: [
        { mint: "hnt", reason: reasons[0] },
        { mint: "mobile", reason: reasons[1] },
        { mint: "iot", reason: reasons[2] },
      ],
      allFailed: true,
    });
  });
});
