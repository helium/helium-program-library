import { expect } from "chai";
import { cronJobFunding } from "../src/hooks/cronJobFunding";

// Mainnet base(15) rent for init_entity_claim_cron_v0's accounts.
const baseAutomationRentLamports = 15_356_840;
const minCrankRewardLamports = 10_000;
const duration = 30;

describe("cronJobFunding", () => {
  it("funds a cron job a schedule change re-creates for the whole duration", () => {
    // The teardown refunds the old cron job's 0.05 SOL to the wallet, and
    // init creates a new cron job that holds only its rent.
    const funding = cronJobFunding({
      recreatesCronJob: true,
      duration,
      minCrankRewardLamports,
      existingCronJobLamports: 50_000_000,
      baseAutomationRentLamports,
      existingCronJobRentLamports: 0,
      numCronTransactions: 0,
    });

    // 0.01 SOL task-return funding + 30 runs at one crank reward each.
    expect(funding.transferLamports).to.equal(10_300_000);
    // Setup rent + schedule-task crank reward + 0.01 SOL task-return funding.
    expect(funding.rentFeeLamports).to.equal(25_366_840);
  });

  it("charges a first setup the setup rent and task-return funding once", () => {
    const funding = cronJobFunding({
      recreatesCronJob: true,
      duration,
      minCrankRewardLamports,
      existingCronJobLamports: 0,
      baseAutomationRentLamports,
      existingCronJobRentLamports: 0,
      numCronTransactions: 0,
    });

    expect(funding.transferLamports).to.equal(10_300_000);
    expect(funding.rentFeeLamports).to.equal(25_366_840);
  });

  it("tops up a cron job that stays by what its balance lacks, with no setup rent", () => {
    const funding = cronJobFunding({
      recreatesCronJob: false,
      duration,
      minCrankRewardLamports,
      existingCronJobLamports: 13_000_000 + 5 * minCrankRewardLamports,
      baseAutomationRentLamports,
      existingCronJobRentLamports: 3_000_000,
      numCronTransactions: 0,
    });

    expect(funding.transferLamports).to.equal(25 * minCrankRewardLamports); // 250_000
    expect(funding.rentFeeLamports).to.equal(0);
  });

  it("prices a top-up at the cron job's claim count", () => {
    const funding = cronJobFunding({
      recreatesCronJob: false,
      duration,
      minCrankRewardLamports,
      existingCronJobLamports: 13_000_000 + 5 * minCrankRewardLamports,
      baseAutomationRentLamports,
      existingCronJobRentLamports: 3_000_000,
      numCronTransactions: 2,
    });

    expect(funding.transferLamports).to.equal(
      duration * 3 * minCrankRewardLamports - 5 * minCrankRewardLamports,
    );
  });

  it("gives no credit to a cron job holding less than its rent", () => {
    const funding = cronJobFunding({
      recreatesCronJob: false,
      duration,
      minCrankRewardLamports,
      existingCronJobLamports: 1_000_000,
      baseAutomationRentLamports,
      existingCronJobRentLamports: 3_000_000,
      numCronTransactions: 0,
    });

    expect(funding.transferLamports).to.equal(
      duration * minCrankRewardLamports,
    );
  });
});
