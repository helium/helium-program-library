import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";
import { describe, it } from "mocha";
import {
  estimateAutomationFunding,
  maxScheduleCronLength,
  resolveScheduleToCron,
} from "../../src/lib/utils/automation-helpers";

describe("resolveScheduleToCron", () => {
  it("passes a raw crontab string through unchanged", () => {
    const raw = "0 30 14 * * 1";
    expect(resolveScheduleToCron(raw)).to.equal(raw);
  });

  it("resolves each preset to a 6-field crontab (not the preset literal)", () => {
    for (const preset of ["daily", "weekly", "monthly"]) {
      const cron = resolveScheduleToCron(preset);
      expect(cron).to.not.equal(preset);
      // sec min hour dom month dow
      expect(cron.split(" ")).to.have.lengthOf(6);
    }
  });

  it("maps daily to an every-day crontab (wildcard dom/month/dow)", () => {
    const [, , , dom, month, dow] = resolveScheduleToCron("daily").split(" ");
    expect([dom, month, dow]).to.deep.equal(["*", "*", "*"]);
  });
});

describe("maxScheduleCronLength", () => {
  it("bounds each preset at its longest crontab", () => {
    expect(maxScheduleCronLength("daily")).to.equal(14);
    expect(maxScheduleCronLength("weekly")).to.equal(14);
    expect(maxScheduleCronLength("monthly")).to.equal(15);
  });

  it("uses a raw crontab's own length", () => {
    const raw = "0 0 0 1,15 * 1-5";
    expect(maxScheduleCronLength(raw)).to.equal(raw.length);
  });
});

describe("estimateAutomationFunding", () => {
  const toLamports = (sol: number) => Math.round(sol * LAMPORTS_PER_SOL);

  it("prices a first-time setup as the init rent and crank reward plus the setup transfers", () => {
    const baseAutomationRentLamports = 20_000_000;
    const minCrankRewardLamports = 15_000;
    const taskReturnAccountFundingLamports = 10_000_000;
    const pdaWalletRentLamports = 890_880;
    const recipientRentLamports = 2_000_000;
    const ataRentLamports = 2_039_280;
    const duration = 30;
    const cronJobCostPerClaimLamports = 10_000;
    const pdaWalletCostPerClaimLamports = 40_000;

    const estimate = estimateAutomationFunding({
      cronJobExists: false,
      baseAutomationRentLamports,
      minCrankRewardLamports,
      // No cron job account yet, so no balance and no rent of its own.
      cronJobBalanceLamports: 0,
      cronJobRentLamports: 0,
      cronJobCostPerClaimLamports,
      pdaWalletBalanceLamports: 0,
      pdaWalletCostPerClaimLamports,
      recipientRentLamports,
      pdaWalletRentLamports,
      additionalDuration: duration,
      ataRentLamports,
      taskReturnAccountFundingLamports,
    });

    // init_entity_claim_cron_v0 locks up the base rent and pays the schedule
    // task its crank reward, both from the wallet. The cron job transfer
    // carries only the task-return funding plus the claims, not the base rent
    // init already paid; the PDA wallet transfer carries its rent, the
    // recipient and ATA rent plus the claims.
    const cronJobTransfer =
      taskReturnAccountFundingLamports + duration * cronJobCostPerClaimLamports;
    const pdaWalletTransfer =
      pdaWalletRentLamports +
      recipientRentLamports +
      ataRentLamports +
      duration * pdaWalletCostPerClaimLamports;
    expect(toLamports(estimate.rentFee)).to.equal(
      baseAutomationRentLamports + minCrankRewardLamports,
    );
    expect(toLamports(estimate.cronJobFunding)).to.equal(cronJobTransfer);
    expect(toLamports(estimate.pdaWalletFunding)).to.equal(pdaWalletTransfer);
    expect(toLamports(estimate.totalSolNeeded)).to.equal(
      baseAutomationRentLamports +
        minCrankRewardLamports +
        cronJobTransfer +
        pdaWalletTransfer,
    );
  });

  it("charges no setup rent when the cron job already exists", () => {
    const estimate = estimateAutomationFunding({
      cronJobExists: true,
      baseAutomationRentLamports: 0,
      minCrankRewardLamports: 15_000,
      // 2_000_000 lamports above rent covers 200 claims at 10_000 each.
      cronJobBalanceLamports: 5_000_000,
      cronJobRentLamports: 3_000_000,
      cronJobCostPerClaimLamports: 10_000,
      // 9_109_120 lamports above rent covers 227 claims at 40_000 each.
      pdaWalletBalanceLamports: 10_000_000,
      pdaWalletCostPerClaimLamports: 40_000,
      recipientRentLamports: 0,
      pdaWalletRentLamports: 890_880,
      additionalDuration: 30,
      ataRentLamports: 0,
      taskReturnAccountFundingLamports: 0,
    });

    // Target is 200 + 30 claims: 30 more for the cron job, 3 more for the PDA wallet.
    expect(estimate.rentFee).to.equal(0);
    expect(toLamports(estimate.totalSolNeeded)).to.equal(
      30 * 10_000 + 3 * 40_000,
    );
  });

  it("charges the recipient rent once when the PDA balance covers part of it", () => {
    const pdaWalletRentLamports = 890_880;
    const ataRentLamports = 2_039_280;
    const recipientRentLamports = 2 * 1_767_840;
    // Above the PDA and ATA rent, below the PDA, ATA and recipient rent.
    const pdaWalletBalanceLamports = 4_000_000;
    const duration = 30;
    const cronJobCostPerClaimLamports = 10_000;
    const pdaWalletCostPerClaimLamports = 40_000;
    const cronJobRentLamports = 3_000_000;

    const estimate = estimateAutomationFunding({
      cronJobExists: true,
      baseAutomationRentLamports: 0,
      minCrankRewardLamports: 15_000,
      // The cron job already holds its rent plus the claims, so it needs nothing.
      cronJobBalanceLamports:
        cronJobRentLamports + duration * cronJobCostPerClaimLamports,
      cronJobRentLamports,
      cronJobCostPerClaimLamports,
      pdaWalletBalanceLamports,
      pdaWalletCostPerClaimLamports,
      recipientRentLamports,
      pdaWalletRentLamports,
      additionalDuration: duration,
      ataRentLamports,
      taskReturnAccountFundingLamports: 0,
    });

    // The PDA wallet transfer tops the balance up to all its rent, which
    // already includes every recipient's rent, then adds the claims.
    const pdaWalletRentShortfall =
      pdaWalletRentLamports +
      recipientRentLamports +
      ataRentLamports -
      pdaWalletBalanceLamports;
    expect(estimate.recipientFee).to.equal(0);
    expect(toLamports(estimate.totalSolNeeded)).to.equal(
      pdaWalletRentShortfall + duration * pdaWalletCostPerClaimLamports,
    );
  });

  it("charges the ATA rent once when the PDA balance already covers it", () => {
    const pdaWalletRentLamports = 890_880;
    const ataRentLamports = 2_039_280;
    const recipientRentLamports = 1_767_840;
    const duration = 30;
    const cronJobCostPerClaimLamports = 10_000;
    const pdaWalletCostPerClaimLamports = 40_000;
    const cronJobRentLamports = 3_000_000;

    const estimate = estimateAutomationFunding({
      cronJobExists: true,
      baseAutomationRentLamports: 0,
      minCrankRewardLamports: 15_000,
      cronJobBalanceLamports:
        cronJobRentLamports + duration * cronJobCostPerClaimLamports,
      cronJobRentLamports,
      cronJobCostPerClaimLamports,
      // Covers the PDA, recipient and missing ATA rent, but no claims.
      pdaWalletBalanceLamports:
        pdaWalletRentLamports + recipientRentLamports + ataRentLamports,
      pdaWalletCostPerClaimLamports,
      recipientRentLamports,
      pdaWalletRentLamports,
      additionalDuration: duration,
      ataRentLamports,
      taskReturnAccountFundingLamports: 0,
    });

    expect(toLamports(estimate.pdaWalletFunding)).to.equal(
      duration * pdaWalletCostPerClaimLamports,
    );
  });
});
