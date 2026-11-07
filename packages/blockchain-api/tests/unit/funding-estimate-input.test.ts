import { GetFundingEstimateInputSchema } from "@helium/blockchain-api";
import { expect } from "chai";
import { describe, it } from "mocha";

const walletAddress = "hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW";

describe("GetFundingEstimateInputSchema claims", () => {
  it("rejects claims without a schedule", () => {
    // Without the schedule the estimate cannot price a schedule change's
    // re-created cron.
    const result = GetFundingEstimateInputSchema.safeParse({
      walletAddress,
      duration: 30,
      claims: { kind: "wallet" },
    });

    expect(result.success).to.be.false;
    expect(result.error?.issues.map((issue) => issue.message)).to.include(
      "schedule is required with claims"
    );
  });

  it("accepts claims with a schedule, and a schedule or nothing without claims", () => {
    for (const input of [
      { claims: { kind: "wallet" }, schedule: "daily" },
      { schedule: "daily" },
      {},
    ]) {
      expect(
        GetFundingEstimateInputSchema.safeParse({
          walletAddress,
          duration: 30,
          ...input,
        }).success
      ).to.be.true;
    }
  });
});
