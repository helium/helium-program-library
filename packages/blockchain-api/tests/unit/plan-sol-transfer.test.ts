import { expect } from "chai";
import { describe, it } from "mocha";
import { planSolTransfer } from "../../src/server/api/routers/migration/procedures/helpers/plan-sol-transfer";

describe("planSolTransfer", () => {
  it("transfers the requested amount when the wallet can cover it", () => {
    expect(planSolTransfer(BigInt(1000), BigInt(5000))).to.deep.eq({
      lamports: BigInt(1000),
    });
  });

  it("transfers the whole balance when the request exceeds it", () => {
    const plan = planSolTransfer(BigInt(5000), BigInt(1200));
    expect(plan.lamports).to.eq(BigInt(1200));
    expect(plan.warning).to.contain("1200");
    expect(plan.warning).to.contain("5000");
  });

  it("transfers the whole balance when the request matches it exactly", () => {
    expect(planSolTransfer(BigInt(1200), BigInt(1200))).to.deep.eq({
      lamports: BigInt(1200),
    });
  });

  it("skips the transfer when the wallet is empty", () => {
    const plan = planSolTransfer(BigInt(5000), BigInt(0));
    expect(plan.lamports).to.eq(null);
    expect(plan.warning).to.contain("Skipping SOL transfer");
  });
});
