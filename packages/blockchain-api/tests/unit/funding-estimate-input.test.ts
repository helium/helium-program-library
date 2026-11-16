import {
  AutomationClaimsSchema,
  GetFundingEstimateInputSchema,
} from "@helium/blockchain-api";
import { Keypair } from "@solana/web3.js";
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

describe("AutomationClaimsSchema entity keys", () => {
  const keys = (n: number) =>
    Array.from({ length: n }, () => Keypair.generate().publicKey.toBase58());
  const parse = (entityKeys: string[]) =>
    AutomationClaimsSchema.safeParse({ kind: "entities", entityKeys });

  it("accepts 50 keys", () => {
    expect(parse(keys(50)).success).to.be.true;
  });

  it("rejects 51 keys", () => {
    expect(parse(keys(51)).success).to.be.false;
  });

  it("rejects an empty list", () => {
    expect(parse([]).success).to.be.false;
  });

  it("rejects duplicate keys", () => {
    const [key] = keys(1);
    const result = parse([key, key]);
    expect(result.success).to.be.false;
    expect(result.error?.issues.map((issue) => issue.message)).to.include(
      "Duplicate entity keys"
    );
  });

  it("rejects a key that is not base58", () => {
    const result = parse([`0${keys(1)[0].slice(1)}`]);
    expect(result.success).to.be.false;
    expect(result.error?.issues.map((issue) => issue.message)).to.include(
      "Entity key must be base58"
    );
  });
});
