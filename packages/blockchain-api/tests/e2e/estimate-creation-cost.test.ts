import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { expect } from "chai";
import { after, before, describe, it } from "mocha";
import { isDefinedError } from "@orpc/client";
import { stopNextServer } from "./helpers/next";
import { stopSurfpool } from "./helpers/surfpool";
import { signAndSubmitTransactionData } from "./helpers/tx";
import { setupTestCtx, TestCtx } from "./helpers/context";
import {
  DEFAULT_HPL_CRONS_TASK_QUEUE,
  TEST_HOTSPOT_ENTITY_KEY,
} from "./helpers/constants";
import { ensureNoContract } from "./helpers/reward-contract";

describe("estimateCreationCost", () => {
  let ctx: TestCtx;

  before(async () => {
    ctx = await setupTestCtx({
      setupFeePayer: true,
      taskQueue: DEFAULT_HPL_CRONS_TASK_QUEUE,
    });
  });

  after(async () => {
    await stopNextServer();
    await stopSurfpool();
  });

  describe("PRESET only (mini-fanout path)", () => {
    before(async () => {
      await ensureNoContract(ctx, TEST_HOTSPOT_ENTITY_KEY);
    });

    it("estimate matches actual transaction cost", async () => {
      const entityPubKey = TEST_HOTSPOT_ENTITY_KEY;
      const walletAddress = ctx.payer.publicKey.toBase58();
      const secondWallet = Keypair.generate().publicKey.toBase58();

      // #given get the cost estimate
      const { data: estimate, error: estimateError } =
        await ctx.safeClient.rewardContract.estimateCreationCost({
          entityPubKey,
          delegateWalletAddress: walletAddress,
          recipients: [
            {
              type: "PRESET",
              walletAddress,
              receives: { type: "SHARES", shares: 50 },
            },
            {
              type: "PRESET",
              walletAddress: secondWallet,
              receives: { type: "SHARES", shares: 50 },
            },
          ],
          rewardSchedule: "30 9 * * *",
        });

      if (estimateError) {
        expect.fail(`Estimate error: ${JSON.stringify(estimateError)}`);
      }

      console.log("Estimate for PRESET-only path:");
      console.log("  Total:", estimate.total.uiAmountString, "SOL");
      console.log(
        "  Transaction fees:",
        estimate.lineItems.transactionFees.uiAmountString,
        "SOL",
      );
      console.log(
        "  Rent fee:",
        estimate.lineItems.rentFee.uiAmountString,
        "SOL",
      );
      console.log(
        "  Recipient gift:",
        estimate.lineItems.recipientGift.uiAmountString,
        "SOL",
      );

      // #when record balance before transaction
      const balanceBefore = await ctx.connection.getBalance(ctx.payer.publicKey);

      // #when create the transaction
      const { data: createData, error: createError } =
        await ctx.safeClient.rewardContract.create({
          entityPubKey,
          signerWalletAddress: walletAddress,
          delegateWalletAddress: walletAddress,
          recipients: [
            {
              type: "PRESET",
              walletAddress,
              receives: { type: "SHARES", shares: 50 },
            },
            {
              type: "PRESET",
              walletAddress: secondWallet,
              receives: { type: "SHARES", shares: 50 },
            },
          ],
          rewardSchedule: "30 9 * * *",
        });

      if (createError) {
        expect.fail(`Create error: ${JSON.stringify(createError)}`);
      }

      // #when submit the transaction
      await signAndSubmitTransactionData(
        ctx.connection,
        createData.unsignedTransactionData,
        ctx.payer,
      );

      // #then record balance after transaction
      const balanceAfter = await ctx.connection.getBalance(ctx.payer.publicKey);
      const actualCost = balanceBefore - balanceAfter;

      console.log("Actual cost:", actualCost / LAMPORTS_PER_SOL, "SOL");
      console.log("Actual cost (lamports):", actualCost);
      console.log("Estimated total (lamports):", estimate.total.amount);

      // #then compare estimate to actual
      const estimatedTotal = BigInt(estimate.total.amount);
      const actualCostBigInt = BigInt(actualCost);

      // Allow small tolerance for priority fees
      const tolerance = BigInt(10000); // 0.00001 SOL tolerance

      console.log("Difference (lamports):", (actualCostBigInt - estimatedTotal).toString());

      // The estimate should be >= actual cost (conservative) or within tolerance
      // A conservative estimate (higher than actual) is acceptable to ensure users have enough funds
      expect(
        estimatedTotal >= actualCostBigInt ||
          actualCostBigInt - estimatedTotal <= tolerance,
        `Estimate ${estimatedTotal} should be >= actual ${actualCostBigInt} or within ${tolerance} tolerance`,
      ).to.be.true;
    });
  });

  describe("CLAIMABLE (welcome pack path)", () => {
    before(async () => {
      await ensureNoContract(ctx, TEST_HOTSPOT_ENTITY_KEY);
    });

    it("estimate matches actual transaction cost", async () => {
      const entityPubKey = TEST_HOTSPOT_ENTITY_KEY;
      const walletAddress = ctx.payer.publicKey.toBase58();
      const giftedAmount = "1000000"; // 0.001 SOL

      // #given get the cost estimate
      const { data: estimate, error: estimateError } =
        await ctx.safeClient.rewardContract.estimateCreationCost({
          entityPubKey,
          delegateWalletAddress: walletAddress,
          recipients: [
            {
              type: "CLAIMABLE",
              giftedCurrency: { amount: giftedAmount, mint: NATIVE_MINT.toBase58() },
              receives: { type: "SHARES", shares: 50 },
            },
            {
              type: "PRESET",
              walletAddress,
              receives: { type: "SHARES", shares: 50 },
            },
          ],
          rewardSchedule: "0 0 1,15 * *",
        });

      if (estimateError) {
        expect.fail(`Estimate error: ${JSON.stringify(estimateError)}`);
      }

      console.log("Estimate for CLAIMABLE path:");
      console.log("  Total:", estimate.total.uiAmountString, "SOL");
      console.log(
        "  Transaction fees:",
        estimate.lineItems.transactionFees.uiAmountString,
        "SOL",
      );
      console.log(
        "  Rent fee:",
        estimate.lineItems.rentFee.uiAmountString,
        "SOL",
      );
      console.log(
        "  Recipient gift:",
        estimate.lineItems.recipientGift.uiAmountString,
        "SOL",
      );

      // Verify recipient gift matches input
      expect(estimate.lineItems.recipientGift.amount).to.equal(giftedAmount);

      // #when record balance before transaction
      const balanceBefore = await ctx.connection.getBalance(ctx.payer.publicKey);

      // #when create the transaction
      const { data: createData, error: createError } =
        await ctx.safeClient.rewardContract.create({
          entityPubKey,
          signerWalletAddress: walletAddress,
          delegateWalletAddress: walletAddress,
          recipients: [
            {
              type: "CLAIMABLE",
              giftedCurrency: { amount: giftedAmount, mint: NATIVE_MINT.toBase58() },
              receives: { type: "SHARES", shares: 50 },
            },
            {
              type: "PRESET",
              walletAddress,
              receives: { type: "SHARES", shares: 50 },
            },
          ],
          rewardSchedule: "0 0 1,15 * *",
        });

      if (createError) {
        expect.fail(`Create error: ${JSON.stringify(createError)}`);
      }

      // #when submit the transaction
      await signAndSubmitTransactionData(
        ctx.connection,
        createData.unsignedTransactionData,
        ctx.payer,
      );

      // #then record balance after transaction
      const balanceAfter = await ctx.connection.getBalance(ctx.payer.publicKey);
      const actualCost = balanceBefore - balanceAfter;

      console.log("Actual cost:", actualCost / LAMPORTS_PER_SOL, "SOL");
      console.log("Actual cost (lamports):", actualCost);
      console.log("Estimated total (lamports):", estimate.total.amount);

      // #then compare estimate to actual
      const estimatedTotal = BigInt(estimate.total.amount);
      const actualCostBigInt = BigInt(actualCost);

      // Allow small tolerance for priority fees
      const tolerance = BigInt(10000); // 0.00001 SOL tolerance

      console.log("Difference (lamports):", (actualCostBigInt - estimatedTotal).toString());

      // The estimate should be >= actual cost (conservative) or within tolerance
      expect(
        estimatedTotal >= actualCostBigInt ||
          actualCostBigInt - estimatedTotal <= tolerance,
        `Estimate ${estimatedTotal} should be >= actual ${actualCostBigInt} or within ${tolerance} tolerance`,
      ).to.be.true;
    });
  });

  describe("error cases", () => {
    it("returns 404 for non-existent hotspot", async () => {
      const randomEntityKey = Keypair.generate().publicKey.toBase58();
      const walletAddress = ctx.payer.publicKey.toBase58();

      const { error } =
        await ctx.safeClient.rewardContract.estimateCreationCost({
          entityPubKey: randomEntityKey,
          delegateWalletAddress: walletAddress,
          recipients: [
            {
              type: "PRESET",
              walletAddress,
              receives: { type: "SHARES", shares: 100 },
            },
          ],
          rewardSchedule: "30 9 * * *",
        });

      if (!isDefinedError(error)) {
        expect.fail(
          `Expected defined ORPCError - but got: ${JSON.stringify(error)}`,
        );
      }
      expect(error.code).to.equal("NOT_FOUND");
    });
  });
});
