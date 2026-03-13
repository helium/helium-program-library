import { Keypair } from "@solana/web3.js"
import { expect } from "chai"
import { after, before, describe, it } from "mocha"
import { isDefinedError } from "@orpc/client"
import { stopNextServer } from "./helpers/next"
import { stopSurfpool } from "./helpers/surfpool"
import { signAndSubmitTransactionData } from "./helpers/tx"
import { setupTestCtx, TestCtx } from "./helpers/context"
import { TEST_HOTSPOT_ENTITY_KEY } from "./helpers/constants"
import { ensureNoContract } from "./helpers/reward-contract"
import { verifyEstimatedSolFee } from "./helpers/estimate"

describe("hotspot-transfer", () => {
  let ctx: TestCtx;

  before(async () => {
    ctx = await setupTestCtx();
  });

  after(async () => {
    await stopNextServer();
    await stopSurfpool();
  });

  it("returns 403 when wallet is not the owner", async () => {
    const wrongWallet = Keypair.generate().publicKey.toBase58();
    const recipient = Keypair.generate().publicKey.toBase58();

    const { error } = await ctx.safeClient.hotspots.transferHotspot({
      walletAddress: wrongWallet,
      hotspotPubkey: TEST_HOTSPOT_ENTITY_KEY,
      recipient,
    });

    if (!isDefinedError(error)) {
      expect.fail(
        `Expected defined ORPCError - but got: ${JSON.stringify(error)}`,
      );
    }
    expect(error.code).to.equal("UNAUTHORIZED");
    expect(error.message).to.include("not the owner");
  });

  it("returns 400 for invalid public key format", async () => {
    const walletAddress = ctx.payer.publicKey.toBase58();

    const { error } = await ctx.safeClient.hotspots.transferHotspot({
      walletAddress,
      hotspotPubkey: TEST_HOTSPOT_ENTITY_KEY,
      recipient: "invalid-pubkey",
    });
    if (!isDefinedError(error)) {
      expect.fail(
        `Expected defined ORPCError - but got: ${JSON.stringify(error)}`,
      );
    }
    expect(error.code).to.equal("BAD_REQUEST");
    expect(error.message).to.include("Input validation failed");
  });

  it("returns 400 for missing required fields", async () => {
    const walletAddress = ctx.payer.publicKey.toBase58();

    // Testing missing required field - TypeScript will error but we want to test runtime validation
    const { error } = await ctx.safeClient.hotspots.transferHotspot({
      walletAddress,
      hotspotPubkey: TEST_HOTSPOT_ENTITY_KEY,
      // Missing recipient
    } as {
      walletAddress: string;
      hotspotPubkey: string;
      recipient: string;
    });
    if (!isDefinedError(error)) {
      expect.fail(
        `Expected defined ORPCError - but got: ${JSON.stringify(error)}`,
      );
    }
    expect(error.code).to.equal("BAD_REQUEST");
    expect(error.message).to.be.a("string");
  });

  it("returns 404 for non-existent hotspot", async () => {
    const walletAddress = ctx.payer.publicKey.toBase58();
    const recipient = Keypair.generate().publicKey.toBase58();
    const nonExistentHotspot = Keypair.generate().publicKey.toBase58();

    const { error } = await ctx.safeClient.hotspots.transferHotspot({
      walletAddress,
      hotspotPubkey: nonExistentHotspot,
      recipient,
    });

    if (!isDefinedError(error)) {
      expect.fail(
        `Expected defined ORPCError - but got: ${JSON.stringify(error)}`,
      );
    }
    expect(error.code).to.equal("NOT_FOUND");
    expect(error.message).to.include("Hotspot not found");
  });

  it("returns 409 when hotspot has active reward contract", async () => {
    // #given hotspot with ACTIVE reward contract
    const walletAddress = ctx.payer.publicKey.toBase58();
    const recipient = Keypair.generate().publicKey.toBase58();

    // Clean up any existing contract first
    await ensureNoContract(ctx, TEST_HOTSPOT_ENTITY_KEY);

    // Create ACTIVE contract (PRESET only = no welcome pack = ACTIVE immediately)
    const secondWallet = Keypair.generate().publicKey.toBase58();
    const createResult = await ctx.safeClient.rewardContract.create({
      entityPubKey: TEST_HOTSPOT_ENTITY_KEY,
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
      rewardSchedule: "0 0 1,15 * *",
    });
    if (createResult.error) {
      expect.fail(`Failed to create contract: ${JSON.stringify(createResult.error)}`);
    }
    await signAndSubmitTransactionData(
      ctx.connection,
      createResult.data.unsignedTransactionData,
      ctx.payer,
    );

    // #when attempting to transfer
    const { error } = await ctx.safeClient.hotspots.transferHotspot({
      walletAddress,
      hotspotPubkey: TEST_HOTSPOT_ENTITY_KEY,
      recipient,
    });

    // #then returns CONFLICT error
    if (!isDefinedError(error)) {
      expect.fail(`Expected CONFLICT error - but got: ${JSON.stringify(error)}`);
    }
    expect(error.code).to.equal("CONFLICT");
    expect(error.message).to.include("reward contract");

    // Cleanup: delete the contract so it doesn't affect other tests
    await ensureNoContract(ctx, TEST_HOTSPOT_ENTITY_KEY);
  });

  // IMPORTANT: This test must run LAST as it actually executes a transfer
  // which modifies the Merkle tree state
  it("transfers a hotspot to another wallet", async () => {
    const walletAddress = ctx.payer.publicKey.toBase58()
    const recipient = Keypair.generate()

    // Clean up any existing reward contract first
    await ensureNoContract(ctx, TEST_HOTSPOT_ENTITY_KEY)

    const { error, data: result } =
      await ctx.safeClient.hotspots.transferHotspot({
        walletAddress,
        hotspotPubkey: TEST_HOTSPOT_ENTITY_KEY,
        recipient: recipient.publicKey.toBase58(),
      })
    if (error) {
      expect.fail(`Unexpected error: ${error}`)
    }
    expect(
      result.transactionData.transactions[0].serializedTransaction,
    ).to.be.a("string")
    expect(result.transactionData.tag).to.be.a("string")
    expect(result.transactionData.parallel).to.equal(false)

    // Verify transaction metadata
    const txData = result.transactionData.transactions[0]
    expect(txData.metadata?.type).to.equal("hotspot_transfer")
    expect(txData.metadata?.description).to.include("Transfer")

    // Verify estimate accuracy
    await verifyEstimatedSolFee(ctx, result.transactionData, result.estimatedSolFee)

    await signAndSubmitTransactionData(
      ctx.connection,
      result.transactionData,
      ctx.payer,
    )
    // Note: We cannot verify ownership change on surfpool because it doesn't support DAS API.
    // The transaction execution without errors is sufficient validation for this test.
  })
})
