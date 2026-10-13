import { expect } from "chai";
import { describe, it } from "mocha";
import { delegationSubmitsInParallel } from "../../src/server/api/routers/governance/procedures/helpers/delegation-submission";

describe("delegationSubmitsInParallel", () => {
  it("is sequential when a position changes sub-DAO and starts its claim bot", () => {
    expect(
      delegationSubmitsInParallel({
        hasClaimTransactions: false,
        positions: [
          { delegation: "extend", taskId: 3 },
          { delegation: "change", taskId: 4 },
        ],
      }),
    ).to.eq(false);
  });

  it("is sequential when a position delegates for the first time and starts its claim bot", () => {
    expect(
      delegationSubmitsInParallel({
        hasClaimTransactions: false,
        positions: [
          { delegation: "extend", taskId: 3 },
          { delegation: "delegate", taskId: 4 },
        ],
      }),
    ).to.eq(false);
  });

  it("stays parallel when no position delegates or changes sub-DAO", () => {
    expect(
      delegationSubmitsInParallel({
        hasClaimTransactions: false,
        positions: [
          { delegation: "extend", taskId: 4 },
          { delegation: null, taskId: 5 },
        ],
      }),
    ).to.eq(true);
  });

  it("stays parallel when a position delegates or changes sub-DAO without a claim bot start", () => {
    expect(
      delegationSubmitsInParallel({
        hasClaimTransactions: false,
        positions: [
          { delegation: "delegate", taskId: null },
          { delegation: "change", taskId: null },
        ],
      }),
    ).to.eq(true);
  });

  it("stays sequential when the batch holds claim transactions", () => {
    expect(
      delegationSubmitsInParallel({
        hasClaimTransactions: true,
        positions: [{ delegation: "extend", taskId: null }],
      }),
    ).to.eq(false);
  });
});
