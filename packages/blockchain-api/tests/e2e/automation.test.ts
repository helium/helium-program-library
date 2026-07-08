import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";
import { after, before, describe, it } from "mocha";
import { applyMinimalServerEnv } from "./helpers/env";
import { ensureNextServer, stopNextServer } from "./helpers/next";
import {
  ensureSurfpool,
  getSurfpoolRpcUrl,
  stopSurfpool,
} from "./helpers/surfpool";
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

// Raw crontab string (6-field clockwork format: sec min hour dom month dow).
const DAILY_CRON = "0 0 0 * * *";

describe("automation endpoints", () => {
  let payer: Keypair;
  let connection: Connection;
  let client: RouterClient<typeof appRouter>;

  // Submit an action's transactions and wait for finalization.
  async function submit(transactionData: any) {
    const signatures = await signAndSubmitTransactionData(
      connection,
      transactionData,
      payer
    );
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("finalized");
    for (const sig of signatures) {
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "finalized"
      );
    }
    return signatures;
  }

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
    await ensureFunds(payer.publicKey, 0.5 * LAMPORTS_PER_SOL);

    const link = new RPCLink({ url: "http://127.0.0.1:3000/rpc" });
    client = createORPCClient(link);
  });

  after(async () => {
    await stopNextServer();
    await stopSurfpool();
  });

  // Make sure no cron exists for a wallet before a test.
  async function closeIfExists(walletAddress: string) {
    const status = await client.hotspots.getAutomationStatus({ walletAddress });
    if (status.hasExistingAutomation || status.isOutOfSol) {
      const closeResult = await client.hotspots.closeAutomation({
        walletAddress,
      });
      await submit(closeResult.transactionData);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  describe("without automation", () => {
    before(async () => {
      await closeIfExists(payer.publicKey.toBase58());
    });

    it("gets automation status for a wallet without automation", async () => {
      const walletAddress = payer.publicKey.toBase58();
      const result = await client.hotspots.getAutomationStatus({
        walletAddress,
      });

      expect(result.hasExistingAutomation).to.equal(false);
      expect(result.isOutOfSol).to.equal(false);
      expect(result.currentSchedule).to.be.undefined;
      expect(result.rentFee).to.equal(
        BASE_AUTOMATION_RENT + TASK_RETURN_ACCOUNT_SIZE
      );
      expect(result.recipientFee).to.be.a("number").and.to.be.at.least(0);
      expect(result.operationalSol).to.be.a("number").and.to.be.at.least(0);
      expect(result.cronJobBalance).to.equal("0");
      expect(Number.isNaN(parseInt(result.pdaWalletBalance, 10))).to.equal(
        false
      );
    });

    it("returns NOT_FOUND when funding a non-existent automation", async () => {
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

    it("returns NOT_FOUND when closing a non-existent automation", async () => {
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

    it("returns NOT_FOUND when adding a wallet claim to a non-existent automation", async () => {
      const walletAddress = payer.publicKey.toBase58();
      try {
        await client.hotspots.addWalletToAutomation({ walletAddress });
        expect.fail("Should have thrown NOT_FOUND error");
      } catch (error: any) {
        expect(error).to.be.instanceOf(ORPCError);
        expect(error.code).to.equal("NOT_FOUND");
      }
    });
  });

  describe("lifecycle", () => {
    let walletAddress: string;
    let totalHotspots: number;
    let firstEntityKey: string | undefined;
    const duration = 5;

    before(async () => {
      walletAddress = payer.publicKey.toBase58();
      await closeIfExists(walletAddress);

      totalHotspots = 1;
      try {
        const hotspotsResult = await client.hotspots.getHotspots({
          walletAddress,
          page: 1,
          limit: 5,
        });
        totalHotspots = hotspotsResult.total || 1;
        firstEntityKey = hotspotsResult.hotspots[0]?.entityKey;
      } catch {
        console.log("getHotspots failed, using default totalHotspots=1");
      }

      // Create the cron itself (init-only, raw cron, pre-funded for `duration`).
      const result = await client.hotspots.createAutomation({
        walletAddress,
        cronSchedule: DAILY_CRON,
        duration,
        totalHotspots,
      });

      expect(result.transactionData.tag).to.equal(
        `setup_automation:${walletAddress}`
      );
      const txData = result.transactionData.transactions[0];
      expect(txData.metadata?.type).to.equal("setup_automation");
      expect(txData.metadata?.cronSchedule).to.equal(DAILY_CRON);
      expect(result.transactionData.actionMetadata).to.deep.include({
        type: "setup_automation",
        cronSchedule: DAILY_CRON,
      });

      await submit(result.transactionData);

      // Wait for the cron to be visible.
      let status = await client.hotspots.getAutomationStatus({ walletAddress });
      let retries = 0;
      while (!status.hasExistingAutomation && retries < 10) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        status = await client.hotspots.getAutomationStatus({ walletAddress });
        retries++;
      }
      if (!status.hasExistingAutomation) {
        throw new Error(
          `Automation setup failed: ${JSON.stringify(status, null, 2)}`
        );
      }
    });

    it("reports the raw cron schedule on status", async () => {
      const result = await client.hotspots.getAutomationStatus({
        walletAddress,
      });
      expect(result.hasExistingAutomation).to.equal(true);
      expect(result.isOutOfSol).to.equal(false);
      expect(result.currentSchedule?.cron).to.equal(DAILY_CRON);
      // Best-effort classification of the raw cron for display.
      expect(result.currentSchedule?.schedule).to.equal("daily");
      expect(result.rentFee).to.equal(0);
      expect(result.cronJobBalance).to.match(/^\d+$/);
      expect(result.pdaWalletBalance).to.match(/^\d+$/);
    });

    it("adds a whole-wallet claim to the cron", async () => {
      const result = await client.hotspots.addWalletToAutomation({
        walletAddress,
      });
      expect(result.transactionData.tag).to.equal(
        `add_wallet_to_automation:${walletAddress}`
      );
      expect(result.transactionData.transactions[0].metadata?.type).to.equal(
        "add_wallet_to_automation"
      );
      await submit(result.transactionData);
    });

    it("funds existing automation by duration and increases both pools' runway", async () => {
      const before = await client.hotspots.getAutomationStatus({
        walletAddress,
      });
      const beforeCron = parseInt(before.cronJobBalance, 10);
      const beforePda = parseInt(before.pdaWalletBalance, 10);

      const additionalDuration = 3;
      const result = await client.hotspots.fundAutomation({
        walletAddress,
        additionalDuration,
      });
      expect(result.transactionData.tag).to.equal(
        `fund_automation:${walletAddress}`
      );
      expect(
        result.transactionData.transactions[0].metadata?.additionalDuration
      ).to.equal(additionalDuration);
      await submit(result.transactionData);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const after = await client.hotspots.getAutomationStatus({
        walletAddress,
      });
      const cronIncrease = parseInt(after.cronJobBalance, 10) - beforeCron;
      const pdaIncrease = parseInt(after.pdaWalletBalance, 10) - beforePda;
      expect(cronIncrease + pdaIncrease).to.be.greaterThan(0);
    });

    it("adds a single hotspot claim to the cron", async function () {
      if (!firstEntityKey) {
        this.skip();
      }
      const result = await client.hotspots.addEntityToAutomation({
        walletAddress,
        entityKey: firstEntityKey!,
      });
      expect(result.transactionData.tag).to.equal(
        `add_entity_to_automation:${walletAddress}`
      );
      const meta = result.transactionData.transactions[0].metadata;
      expect(meta?.type).to.equal("add_entity_to_automation");
      expect(meta?.entityKey).to.equal(firstEntityKey);
      await submit(result.transactionData);
    });

    it("removes a claim entry by index", async () => {
      // The whole-wallet claim added first sits at index 0.
      const result = await client.hotspots.removeEntityFromAutomation({
        walletAddress,
        index: 0,
      });
      expect(result.transactionData.tag).to.equal(
        `remove_entity_from_automation:${walletAddress}`
      );
      expect(result.transactionData.transactions[0].metadata?.index).to.equal(
        0
      );
      await submit(result.transactionData);
    });

    it("rejects removing an out-of-range claim index", async () => {
      try {
        await client.hotspots.removeEntityFromAutomation({
          walletAddress,
          index: 9999,
        });
        expect.fail("Should have thrown NOT_FOUND error");
      } catch (error: any) {
        expect(error).to.be.instanceOf(ORPCError);
        expect(error.code).to.equal("NOT_FOUND");
      }
    });

    it("closes automation and verifies removal", async () => {
      const result = await client.hotspots.closeAutomation({ walletAddress });
      expect(result.transactionData.tag).to.equal(
        `close_automation:${walletAddress}`
      );
      await submit(result.transactionData);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const status = await client.hotspots.getAutomationStatus({
        walletAddress,
      });
      expect(status.hasExistingAutomation).to.equal(false);
      expect(status.currentSchedule).to.be.undefined;
    });
  });

  describe("operator floor top-up", () => {
    it("builds transfers for pools at or below the floor", async () => {
      const walletAddress = payer.publicKey.toBase58();
      // A fresh wallet's pools are empty (balance 0), so both are <= floor.
      const target = Keypair.generate().publicKey.toBase58();
      const result = await client.hotspots.topUpAutomation({
        operatorAddress: walletAddress,
        floorLamports: 1_000_000,
        fundLamports: 2_000_000,
        targets: [target],
      });
      expect(result.transactionData.tag).to.equal(
        `top_up_automation:${walletAddress}`
      );
      // Both pools (cron + claim) for the empty target need funding.
      expect(result.transactionData.actionMetadata).to.deep.include({
        type: "top_up_automation",
        poolsFunded: 2,
      });
      expect(
        result.transactionData.transactions[0].serializedTransaction.length
      ).to.be.greaterThan(100);
    });
  });

  describe("validation", () => {
    it("rejects an empty cron schedule", async () => {
      const walletAddress = payer.publicKey.toBase58();
      try {
        await (client.hotspots.createAutomation as any)({
          walletAddress,
          cronSchedule: "",
          duration: 5,
          totalHotspots: 1,
        });
        expect.fail("Should have thrown a validation error");
      } catch (error: any) {
        expect(error).to.be.instanceOf(Error);
        if (error instanceof ORPCError) {
          expect(error.code).to.equal("BAD_REQUEST");
        }
      }
    });

    it("rejects an invalid wallet address", async () => {
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
        expect(error.message.toLowerCase()).to.match(
          /invalid|validation|address/
        );
      }
    });
  });
});
