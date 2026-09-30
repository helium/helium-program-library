import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";
import { describe, it } from "mocha";
import {
  estimateAutomationFunding,
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

describe("estimateAutomationFunding", () => {
  const toLamports = (sol: number) => Math.round(sol * LAMPORTS_PER_SOL);

  it("prices a first-time setup as the init rent plus the setup transfers", () => {
    const baseAutomationRentLamports = 20_000_000;
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

    // init_entity_claim_cron_v0 locks up the base rent. The cron job transfer
    // carries the task-return funding once plus the claims; the PDA wallet
    // transfer carries its rent, the recipient and ATA rent plus the claims.
    const cronJobTransfer =
      taskReturnAccountFundingLamports + duration * cronJobCostPerClaimLamports;
    const pdaWalletTransfer =
      pdaWalletRentLamports +
      recipientRentLamports +
      ataRentLamports +
      duration * pdaWalletCostPerClaimLamports;
    expect(toLamports(estimate.totalSolNeeded)).to.equal(
      baseAutomationRentLamports + cronJobTransfer + pdaWalletTransfer,
    );
  });

  it("charges no setup rent when the cron job already exists", () => {
    const estimate = estimateAutomationFunding({
      cronJobExists: true,
      baseAutomationRentLamports: 0,
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
});
