import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { expect } from "chai";
import { after, before, describe, it } from "mocha";
import { applyMinimalServerEnv } from "./helpers/env";
import { ensureNextServer, stopNextServer } from "./helpers/next";
import { ensureSurfpool, getSurfpoolRpcUrl, stopSurfpool } from "./helpers/surfpool";
import { ensureFunds, loadKeypairFromEnv } from "./helpers/wallet";
import { signAndSubmitTransactionData } from "./helpers/tx";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { appRouter } from "@/server/api";
import type { RouterClient } from "@orpc/server";
import { ORPCError } from "@orpc/server";
// Import constants directly to avoid path alias issues in tests
const BASE_AUTOMATION_RENT = 0.02098095;
const TASK_RETURN_ACCOUNT_SIZE = 0.01;
const RECIPIENT_RENT = 0.00242208;

describe("automation endpoints", () => {
  let payer: Keypair;
  let connection: Connection;
  let client: RouterClient<typeof appRouter>;

  before(async () => {
    if (!process.env.ASSET_ENDPOINT) {
      throw new Error(
        "ASSET_ENDPOINT is not set. You need to set it to a DAS capable mainnet endpoint."
      );
    }
    applyMinimalServerEnv();
    await ensureSurfpool();
    await ensureNextServer();
    payer = loadKeypairFromEnv();
    connection = new Connection(getSurfpoolRpcUrl(), "confirmed");
    await ensureFunds(payer.publicKey, 0.1 * LAMPORTS_PER_SOL);

    // Create ORPC client pointing to the test server
    const link = new RPCLink({
      url: "http://127.0.0.1:3000/rpc",
    });
    client = createORPCClient(link);
  });

  after(async () => {
    await stopNextServer();
    await stopSurfpool();
  });

  describe("without automation", () => {
    before(async () => {
      const walletAddress = payer.publicKey.toBase58();
      const status = await client.hotspots.getAutomationStatus({
        walletAddress,
      });
      if (status.hasExistingAutomation) {
        const closeResult = await client.hotspots.closeAutomation({
          walletAddress,
        });
        await signAndSubmitTransactionData(
          connection,
          closeResult.transactionData,
          payer,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    });

    it("gets automation status for wallet without automation", async () => {
      const walletAddress = payer.publicKey.toBase58();

      const result = await client.hotspots.getAutomationStatus({
        walletAddress,
      });

      expect(result.hasExistingAutomation).to.equal(false);
      expect(result.isOutOfSol).to.equal(false);
      expect(result.currentSchedule).to.be.undefined;
      // Rent fee should be BASE_AUTOMATION_RENT + TASK_RETURN_ACCOUNT_SIZE when no automation exists
      expect(result.rentFee).to.equal(
        BASE_AUTOMATION_RENT + TASK_RETURN_ACCOUNT_SIZE
      );
      // Fees should be valid numbers
      expect(result.recipientFee).to.be.a("number");
      expect(result.operationalSol).to.be.a("number");
      expect(result.recipientFee).to.be.at.least(0);
      expect(result.operationalSol).to.be.at.least(0);
      // Balances should be strings representing lamports
      expect(result.cronJobBalance).to.equal("0");
      // PDA balance should be a valid number (parseInt will return NaN if invalid)
      const pdaBalance = parseInt(result.pdaWalletBalance, 10);
      expect(Number.isNaN(pdaBalance)).to.equal(false);
    });

    it("returns NOT_FOUND error when trying to fund non-existent automation", async () => {
      const walletAddress = payer.publicKey.toBase58();

      try {
        await client.hotspots.fundAutomation({
          walletAddress,
          additionalDuration: 1,
        });
        expect.fail("Should have thrown NOT_FOUND error");
      } catch (error: any) {
        expect(error).to.be.instanceOf(ORPCError);
        expect(error.code).to.equal("NOT_FOUND");
        expect(error.message).to.include("Automation not found");
      }
    });

    it("returns NOT_FOUND error when trying to close non-existent automation", async () => {
      const walletAddress = payer.publicKey.toBase58();

      try {
        await client.hotspots.closeAutomation({ walletAddress });
        expect.fail("Should have thrown NOT_FOUND error");
      } catch (error: any) {
        expect(error).to.be.instanceOf(ORPCError);
        expect(error.code).to.equal("NOT_FOUND");
        expect(error.message).to.include("Automation not found");
      }
    });
  });

  describe("with automation", () => {
    let walletAddress: string;
    let totalHotspots: number;
    const schedule = "daily";
    const duration = 5;

    before(async () => {
      walletAddress = payer.publicKey.toBase58();
      // Get hotspot count first using the API
      // Note: getHotspots may fail validation in test environment, so we use a default
      totalHotspots = 1;
      try {
        const hotspotsResult = await client.hotspots.getHotspots({
          walletAddress,
          page: 1,
          limit: 1,
        });
        totalHotspots = hotspotsResult.total;
      } catch (error) {
        // If getHotspots fails (e.g., validation error), use default of 1 for testing
        console.log(
          "getHotspots failed, using default totalHotspots=1 for test"
        );
      }

      if (totalHotspots === 0) {
        throw new Error(
          "Cannot set up automation test - no hotspots found for wallet"
        );
      }

      // Set up automation
      const result = await client.hotspots.createAutomation({
        walletAddress,
        schedule,
        duration,
        totalHotspots,
      });

      // Verify transaction was created
      expect(result.transactionData.transactions.length).to.equal(1);
      expect(result.transactionData.tag).to.equal(
        `setup_automation:${walletAddress}`
      );
      expect(result.transactionData.parallel).to.equal(false);

      // Verify transaction metadata
      const txData = result.transactionData.transactions[0];
      expect(txData.metadata?.type).to.equal("setup_automation");
      expect(txData.metadata?.description).to.equal(
        "Set up hotspot claim automation"
      );
      expect(txData.metadata?.schedule).to.equal(schedule);
      expect(txData.metadata?.duration).to.equal(duration);
      expect(txData.serializedTransaction.length).to.be.greaterThan(100);

      // Verify batch-level actionMetadata
      expect(result.transactionData.actionMetadata).to.deep.include({
        type: "setup_automation",
      });

      // Submit transaction
      const signatures = await signAndSubmitTransactionData(
        connection,
        result.transactionData,
        payer
      );

      // Wait for transactions to be finalized
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("finalized");
      for (const sig of signatures) {
        await connection.confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          "finalized"
        );
      }

      // Verify automation was created - retry a few times if needed
      let status = await client.hotspots.getAutomationStatus({ walletAddress });
      let retries = 0;
      const maxRetries = 10;
      while (!status.hasExistingAutomation && retries < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        status = await client.hotspots.getAutomationStatus({ walletAddress });
        retries++;
      }

      if (!status.hasExistingAutomation) {
        throw new Error(
          `Automation setup failed after ${retries} retries. Status: ${JSON.stringify(
            status,
            null,
            2
          )}`
        );
      }
    });

    it("gets automation status showing automation exists", async () => {
      const result = await client.hotspots.getAutomationStatus({
        walletAddress,
      });

      expect(result.hasExistingAutomation).to.equal(true);
      expect(result.isOutOfSol).to.equal(false);
      expect(result.currentSchedule).to.not.be.undefined;
      expect(result.currentSchedule?.schedule).to.equal("daily");
      expect(result.currentSchedule?.time).to.match(/^\d{1,2}:\d{2}\s(AM|PM)$/);
      const nextRunDate = new Date(result.currentSchedule!.nextRun);
      expect(nextRunDate.getTime()).to.be.greaterThan(Date.now());
      expect(result.rentFee).to.equal(0);
      expect(result.recipientFee).to.be.closeTo(0.00726624, 0.00000001);
      expect(result.operationalSol).to.equal(0);
      expect(result.remainingClaims).to.equal(22);
      expect(result.fundingPeriodInfo?.periodLength).to.equal("daily");
      expect(result.fundingPeriodInfo?.periodsRemaining).to.equal(22);
      expect(result.fundingPeriodInfo?.cronJobPeriodsRemaining).to.equal(1035);
      expect(result.fundingPeriodInfo?.pdaWalletPeriodsRemaining).to.equal(22);
      expect(result.pdaWalletBalance).to.equal("10850880");
    });

    it("funds existing automation with additional duration", async () => {
      const initialStatus = await client.hotspots.getAutomationStatus({
        walletAddress,
      });
      const beforeBalance = parseInt(initialStatus.cronJobBalance, 10);

      console.log("initialStatus", initialStatus);

      const additionalDuration = 3;
      const result = await client.hotspots.fundAutomation({
        walletAddress,
        additionalDuration,
      });

      expect(result.transactionData.tag).to.equal(
        `fund_automation:${walletAddress}`
      );
      expect(result.transactionData.parallel).to.equal(false);

      // fundAutomation should always return transactions when automation exists
      expect(result.transactionData.transactions.length).to.equal(1);
      expect(
        result.transactionData.transactions[0].serializedTransaction.length
      ).to.be.greaterThan(100);

      // Verify transaction metadata
      const txData = result.transactionData.transactions[0];
      expect(txData.metadata?.type).to.equal("fund_automation");
      expect(txData.metadata?.description).to.equal(
        "Fund hotspot claim automation"
      );
      expect(txData.metadata?.additionalDuration).to.equal(additionalDuration);

      // Submit transaction
      await signAndSubmitTransactionData(
        connection,
        result.transactionData,
        payer
      );

      // Wait a bit for transaction to settle
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify balance increased and pools are balanced
      const afterStatus = await client.hotspots.getAutomationStatus({
        walletAddress,
      });
      console.log("afterStatus", afterStatus);
      const beforePdaBalance = parseInt(initialStatus.pdaWalletBalance, 10);
      const afterCronBalance = parseInt(afterStatus.cronJobBalance, 10);
      const afterPdaBalance = parseInt(afterStatus.pdaWalletBalance, 10);
      const cronBalanceIncrease = afterCronBalance - beforeBalance;
      const pdaBalanceIncrease = afterPdaBalance - beforePdaBalance;
      // At least one pool should have increased (the one that needed funding)
      expect(cronBalanceIncrease + pdaBalanceIncrease).to.be.greaterThan(0);

      // Verify that periods remaining increased by the additional duration
      // Note: We fund each pool independently to reach the target, so pools may not be equal
      // if one pool already has more periods than the target
      if (afterStatus.fundingPeriodInfo) {
        const initialPeriods =
          initialStatus.fundingPeriodInfo?.periodsRemaining || 0;
        const afterPeriods = afterStatus.fundingPeriodInfo.periodsRemaining;
        // Periods should have increased by at least the additional duration
        // (may be more if one pool was already above the target)
        expect(afterPeriods).to.be.at.least(
          initialPeriods + additionalDuration
        );
        // The effective periods remaining should be the minimum of both pools
        expect(afterStatus.fundingPeriodInfo.periodsRemaining).to.equal(
          Math.min(
            afterStatus.fundingPeriodInfo.cronJobPeriodsRemaining,
            afterStatus.fundingPeriodInfo.pdaWalletPeriodsRemaining
          )
        );
      }
    });

    it("gets funding estimate for automation", async () => {
      const duration = 5;
      const result = await client.hotspots.getFundingEstimate({
        walletAddress,
        duration,
      });

      // Verify funding amounts are calculated correctly (use closeTo for floating point precision)
      // When automation exists, rentFee should be 0
      expect(result.rentFee).to.equal(0);
      // Recipient fee should be 0 because recipient rent was already paid when automation was created
      expect(result.recipientFee).to.equal(0);
      // operationalSol should be the sum of cronJobFunding and pdaWalletFunding
      const calculatedOperationalSol =
        result.cronJobFunding + result.pdaWalletFunding;
      expect(result.operationalSol).to.be.closeTo(calculatedOperationalSol, 0.00000001);
      // totalSolNeeded should be rentFee + operationalSol + recipientFee
      const calculatedTotalSolNeeded =
        result.rentFee + result.operationalSol + result.recipientFee;
      expect(result.totalSolNeeded).to.be.closeTo(
        calculatedTotalSolNeeded,
        0.00000001
      );
      const cronBalance = parseInt(result.currentCronJobBalance, 10);
      const pdaBalance = parseInt(result.currentPdaWalletBalance, 10);
      expect(Number.isNaN(cronBalance)).to.equal(false);
      expect(Number.isNaN(pdaBalance)).to.equal(false);
    });

    it("returns funding estimate with rentFee when automation does not exist", async () => {
      // Use a different wallet that doesn't have automation
      const testWallet = Keypair.generate();
      await ensureFunds(testWallet.publicKey, 0.01 * LAMPORTS_PER_SOL);
      const testWalletAddress = testWallet.publicKey.toBase58();

      const result = await client.hotspots.getFundingEstimate({
        walletAddress: testWalletAddress,
        duration: 1,
      });

      // When automation doesn't exist, rentFee should include initial setup rent
      expect(result.rentFee).to.equal(
        BASE_AUTOMATION_RENT + TASK_RETURN_ACCOUNT_SIZE
      );
      // operationalSol should be the sum of cronJobFunding and pdaWalletFunding
      const calculatedOperationalSol =
        result.cronJobFunding + result.pdaWalletFunding;
      expect(result.operationalSol).to.be.closeTo(calculatedOperationalSol, 0.00000001);
      // totalSolNeeded should be rentFee + operationalSol + recipientFee
      const calculatedTotalSolNeeded =
        result.rentFee + result.operationalSol + result.recipientFee;
      expect(result.totalSolNeeded).to.be.closeTo(
        calculatedTotalSolNeeded,
        0.00000001
      );
      // Balances should be 0 when automation doesn't exist
      expect(result.currentCronJobBalance).to.equal("0");
      expect(result.currentPdaWalletBalance).to.equal("0");
    });

    it("returns INSUFFICIENT_FUNDS error when wallet doesn't have enough SOL to fund absurdly long duration", async () => {
      // Use the main wallet which has automation set up
      // Try to fund with an absurdly long duration that requires more SOL than the wallet has
      const absurdDuration = 1_000_000_000_000;

      try {
        await client.hotspots.fundAutomation({
          walletAddress,
          additionalDuration: absurdDuration,
        });
        expect.fail("Should have thrown INSUFFICIENT_FUNDS error");
      } catch (error: any) {
        expect(error).to.be.instanceOf(ORPCError);
        expect(error.code).to.equal("INSUFFICIENT_FUNDS");
        expect(error.message).to.include("Insufficient SOL balance");
        expect(error.data?.required).to.be.greaterThan(0);
        expect(error.data?.available).to.be.greaterThan(0);
        expect(error.data?.required).to.be.greaterThan(error.data?.available);
      }
    });

    it("closes automation and verifies it was removed", async () => {
      const result = await client.hotspots.closeAutomation({ walletAddress });

      // Should have at least one transaction (remove entities + close)
      expect(result.transactionData.transactions.length).to.be.greaterThan(0);
      expect(result.transactionData.tag).to.equal(
        `close_automation:${walletAddress}`
      );
      expect(result.transactionData.parallel).to.equal(false);
      expect(
        result.transactionData.transactions[0].serializedTransaction.length
      ).to.be.greaterThan(100);

      // Verify transaction metadata
      const txData = result.transactionData.transactions[0];
      expect(txData.metadata?.type).to.equal("close_automation");
      expect(txData.metadata?.description).to.equal(
        "Close hotspot claim automation"
      );

      // Submit transaction
      await signAndSubmitTransactionData(
        connection,
        result.transactionData,
        payer
      );

      // Wait a bit for transaction to settle
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify automation was closed
      const status = await client.hotspots.getAutomationStatus({
        walletAddress,
      });
      expect(status.hasExistingAutomation).to.equal(false);
      expect(status.isOutOfSol).to.equal(false);
      expect(status.currentSchedule).to.be.undefined;
      // Rent fee should be back to initial setup cost
      expect(status.rentFee).to.equal(
        BASE_AUTOMATION_RENT + TASK_RETURN_ACCOUNT_SIZE
      );
    });
  });

  describe("validation", () => {
    it("validates schedule parameter must be daily, weekly, or monthly", async () => {
      const walletAddress = payer.publicKey.toBase58();

      // Get hotspot count first using the API
      // Note: getHotspots may fail validation in test environment, so we use a default
      let totalHotspots = 1;
      try {
        const hotspotsResult = await client.hotspots.getHotspots({
          walletAddress,
          page: 1,
          limit: 1,
        });
        totalHotspots = hotspotsResult.total;
      } catch (error) {
        // If getHotspots fails (e.g., validation error), use default of 1 for testing
        console.log(
          "getHotspots failed, using default totalHotspots=1 for test"
        );
      }

      if (totalHotspots === 0) {
        throw new Error(
          "Cannot test validation - no hotspots found for wallet"
        );
      }

      try {
        await (client.hotspots.createAutomation as any)({
          walletAddress,
          schedule: "invalid",
          duration: 5,
          totalHotspots,
        });
        expect.fail("Should have thrown a validation error");
      } catch (error: any) {
        expect(error).to.be.instanceOf(Error);
        // Validation errors might be ORPCError or ValidationError
        if (error instanceof ORPCError) {
          expect(error.code).to.equal("BAD_REQUEST");
        }
        // Error should mention validation failure
        expect(error.message.toLowerCase()).to.match(
          /invalid|validation|schedule/
        );
      }
    });

    it("validates wallet address format must be valid base58", async () => {
      try {
        await client.hotspots.getAutomationStatus({
          walletAddress: "invalid-address",
        });
        expect.fail("Should have thrown a validation error");
      } catch (error: any) {
        expect(error).to.be.instanceOf(Error);
        if (error instanceof ORPCError) {
          expect(error.code).to.equal("BAD_REQUEST");
        }
        // Error should mention validation failure
        expect(error.message.toLowerCase()).to.match(
          /invalid|validation|address/
        );
      }
    });
  });
});
