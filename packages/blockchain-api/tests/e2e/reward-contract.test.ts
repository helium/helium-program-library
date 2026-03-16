import { AnchorProvider } from "@coral-xyz/anchor";
import {
  init as initHem,
  keyToAssetKey,
} from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import { init as initLd, recipientKey } from "@helium/lazy-distributor-sdk";
import { HNT_MINT } from "@helium/spl-utils";
import {
  init as initWelcomePack,
  userWelcomePacksKey,
} from "@helium/welcome-pack-sdk";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { expect } from "chai";
import { after, before, describe, it } from "mocha";
import { isDefinedError } from "@orpc/client";
import { stopNextServer } from "./helpers/next"
import { stopSurfpool } from "./helpers/surfpool"
import { ensureFunds } from "./helpers/wallet"
import { signAndSubmitTransactionData } from "./helpers/tx"
import { setupTestCtx, TestCtx } from "./helpers/context"
import { DEFAULT_HPL_CRONS_TASK_QUEUE, TEST_HOTSPOT_ENTITY_KEY } from "./helpers/constants"
import { ensureNoContract, ensurePendingContract } from "./helpers/reward-contract"
import { verifyEstimatedSolFee } from "./helpers/estimate"
import nacl from "tweetnacl"

describe("reward-contract", () => {
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

  describe("find", () => {
    before(async () => {
      await ensureNoContract(ctx, TEST_HOTSPOT_ENTITY_KEY);
    });

    it("returns NONE for hotspot without reward contract", async () => {
      // #given hotspot without existing contract
      const entityPubKey = TEST_HOTSPOT_ENTITY_KEY;

      // #when querying contract status
      const { data, error } = await ctx.safeClient.rewardContract.find({
        entityPubKey,
      });

      // #then returns NONE status
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.status).to.equal("NONE");
    });

    it("returns 404 for non-existent hotspot", async () => {
      // #given random entity key
      const entityPubKey = Keypair.generate().publicKey.toBase58();

      // #when querying contract status
      const { error } = await ctx.safeClient.rewardContract.find({
        entityPubKey,
      });

      // #then returns NOT_FOUND
      if (!isDefinedError(error)) {
        expect.fail(
          `Expected defined ORPCError - but got: ${JSON.stringify(error)}`,
        );
      }
      expect(error.code).to.equal("NOT_FOUND");
    });
  });

  describe("create", () => {
    before(async () => {
      await ensureNoContract(ctx, TEST_HOTSPOT_ENTITY_KEY);
    });

    it("creates a pending reward contract", async () => {
      // #given owned hotspot
      const entityPubKey = TEST_HOTSPOT_ENTITY_KEY;
      const walletAddress = ctx.payer.publicKey.toBase58();

      // #when creating contract
      const { data, error } = await ctx.safeClient.rewardContract.create({
        entityPubKey,
        signerWalletAddress: walletAddress,
        delegateWalletAddress: walletAddress,
        recipients: [
          {
            type: "CLAIMABLE",
            giftedCurrency: { amount: "1000000", mint: NATIVE_MINT.toBase58() },
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

      // #then returns valid unsigned transaction
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`)
      }
      expect(
        data?.unsignedTransactionData?.transactions?.[0]?.serializedTransaction,
      ).to.be.a("string")
      expect(data?.unsignedTransactionData?.tag).to.be.a("string")

      // Verify estimate accuracy
      await verifyEstimatedSolFee(ctx, data.unsignedTransactionData, data.estimatedSolFee)

      // #then tx submits successfully
      await signAndSubmitTransactionData(
        ctx.connection,
        data.unsignedTransactionData,
        ctx.payer,
      )

      // #then welcome pack exists on-chain
      const provider = new AnchorProvider(
        ctx.connection,
        {
          publicKey: ctx.payer.publicKey,
          signAllTransactions: async () => {
            throw new Error("not supported in test");
          },
          signTransaction: async () => {
            throw new Error("not supported in test");
          },
        } as any,
        AnchorProvider.defaultOptions(),
      );

      const wpProgram = await initWelcomePack(provider);
      const ownerPubkey = ctx.payer.publicKey;

      const [userWelcomePacksK] = userWelcomePacksKey(ownerPubkey);
      const userWelcomePacks =
        await wpProgram.account.userWelcomePacksV0.fetchNullable(
          userWelcomePacksK,
        );
      expect(userWelcomePacks).to.exist;
    });

    it("returns 409 when welcome pack already exists for hotspot", async () => {
      // #given hotspot with existing welcome pack (created in previous test)
      const entityPubKey = TEST_HOTSPOT_ENTITY_KEY;
      const walletAddress = ctx.payer.publicKey.toBase58();

      // #when creating duplicate contract
      const { error } = await ctx.safeClient.rewardContract.create({
        entityPubKey,
        signerWalletAddress: walletAddress,
        delegateWalletAddress: walletAddress,
        recipients: [
          {
            type: "CLAIMABLE",
            giftedCurrency: { amount: "1000000", mint: NATIVE_MINT.toBase58() },
            receives: { type: "SHARES", shares: 100 },
          },
        ],
        rewardSchedule: "0 0 1,15 * *",
      });

      // #then returns CONFLICT
      if (!isDefinedError(error)) {
        expect.fail(
          `Expected defined ORPCError - but got: ${JSON.stringify(error)}`,
        );
      }
      expect(error.code).to.equal("CONFLICT");
      expect(error.message).to.include("already exists");
    });

    it("returns 403 when wallet is not the owner", async () => {
      // #given hotspot not owned by this wallet
      const entityPubKey = TEST_HOTSPOT_ENTITY_KEY;
      const wrongWallet = Keypair.generate().publicKey.toBase58();

      // #when creating contract
      const { error } = await ctx.safeClient.rewardContract.create({
        entityPubKey,
        signerWalletAddress: wrongWallet,
        delegateWalletAddress: wrongWallet,
        recipients: [
          {
            type: "CLAIMABLE",
            giftedCurrency: { amount: "1000000", mint: NATIVE_MINT.toBase58() },
            receives: { type: "SHARES", shares: 100 },
          },
        ],
        rewardSchedule: "0 0 1,15 * *",
      });

      // #then returns UNAUTHORIZED
      if (!isDefinedError(error)) {
        expect.fail(
          `Expected defined ORPCError - but got: ${JSON.stringify(error)}`,
        );
      }
      expect(error.code).to.equal("UNAUTHORIZED");
    });
  });

  describe("find (after create)", () => {
    before(async () => {
      await ensurePendingContract(ctx, TEST_HOTSPOT_ENTITY_KEY);
    });

    it("finds PENDING contract for hotspot with welcome pack", async () => {
      // #given hotspot with pending contract (ensured by before hook)
      const entityPubKey = TEST_HOTSPOT_ENTITY_KEY;

      // #when querying contract status
      const { data, error } = await ctx.safeClient.rewardContract.find({
        entityPubKey,
      });

      // #then returns PENDING with contract details
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.status).to.equal("PENDING");
      if (data?.status === "PENDING") {
        expect(data.contract?.delegateWalletAddress).to.be.a("string");
        expect(data.contract?.recipients).to.be.an("array");
        expect(data.contract?.rewardSchedule).to.equal("0 0 1,15 * *");
      }
    });
  });

  describe("invite", () => {
    before(async () => {
      await ensurePendingContract(ctx, TEST_HOTSPOT_ENTITY_KEY);
    });

    it("generates an invite message for pending contract", async () => {
      // #given hotspot with pending contract
      const entityPubKey = TEST_HOTSPOT_ENTITY_KEY;
      const walletAddress = ctx.payer.publicKey.toBase58();

      // #when generating invite
      const { data, error } = await ctx.safeClient.rewardContract.invite({
        entityPubKey,
        signerWalletAddress: walletAddress,
      });

      // #then returns message and expiration
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.unsignedMessage).to.be.a("string");
      expect(data?.unsignedMessage).to.include("Approve invite");
      expect(data?.expiration).to.be.a("string");
    });

    it("returns 403 when wallet is not the delegate", async () => {
      // #given hotspot with pending contract owned by another wallet
      const entityPubKey = TEST_HOTSPOT_ENTITY_KEY;
      const wrongWallet = Keypair.generate().publicKey.toBase58();

      // #when generating invite
      const { error } = await ctx.safeClient.rewardContract.invite({
        entityPubKey,
        signerWalletAddress: wrongWallet,
      });

      // #then returns UNAUTHORIZED
      if (!isDefinedError(error)) {
        expect.fail(
          `Expected defined ORPCError - but got: ${JSON.stringify(error)}`,
        );
      }
      expect(error.code).to.equal("UNAUTHORIZED");
    });

    it("returns 404 when no contract exists to invite", async () => {
      // #given random non-existent hotspot
      const entityPubKey = Keypair.generate().publicKey.toBase58();
      const walletAddress = ctx.payer.publicKey.toBase58();

      // #when generating invite
      const { error } = await ctx.safeClient.rewardContract.invite({
        entityPubKey,
        signerWalletAddress: walletAddress,
      });

      // #then returns NOT_FOUND
      if (!isDefinedError(error)) {
        expect.fail(
          `Expected defined ORPCError - but got: ${JSON.stringify(error)}`,
        );
      }
      expect(error.code).to.equal("NOT_FOUND");
    });

    it("respects custom expirationDays", async () => {
      // #given hotspot with pending contract
      const entityPubKey = TEST_HOTSPOT_ENTITY_KEY;
      const walletAddress = ctx.payer.publicKey.toBase58();
      const customDays = 14;

      // #when generating invite with custom expiration
      const { data, error } = await ctx.safeClient.rewardContract.invite({
        entityPubKey,
        signerWalletAddress: walletAddress,
        expirationDays: customDays,
      });

      // #then expiration reflects custom days
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      const expirationDate = new Date(data.expiration);
      const expectedMin = Date.now() + (customDays - 1) * 24 * 60 * 60 * 1000;
      const expectedMax = Date.now() + (customDays + 1) * 24 * 60 * 60 * 1000;
      expect(expirationDate.getTime()).to.be.greaterThan(expectedMin);
      expect(expirationDate.getTime()).to.be.lessThan(expectedMax);
    });
  });

  describe("claim", () => {
    before(async () => {
      await ensurePendingContract(ctx, TEST_HOTSPOT_ENTITY_KEY);
    });

    it("rejects invalid signature", async () => {
      // #given pending contract (ensured by before hook), wrong keypair signature
      const entityPubKey = TEST_HOTSPOT_ENTITY_KEY;
      const delegate = ctx.payer;
      const wrongSigner = Keypair.generate();
      const claimer = Keypair.generate();

      await ensureFunds(claimer.publicKey, 0.01 * LAMPORTS_PER_SOL);

      const inviteResult = await ctx.client.rewardContract.invite({
        entityPubKey,
        signerWalletAddress: delegate.publicKey.toBase58(),
      });

      // Sign with WRONG keypair instead of delegate
      const message = Buffer.from(inviteResult.unsignedMessage);
      const wrongSig = nacl.sign.detached(message, wrongSigner.secretKey);
      const wrongSignatureB64 = Buffer.from(wrongSig).toString("base64");

      // #when claiming with invalid signature
      const { data, error } = await ctx.safeClient.rewardContract.claim({
        entityPubKey,
        signerWalletAddress: claimer.publicKey.toBase58(),
        delegateSignature: wrongSignatureB64,
        expiration: inviteResult.expiration,
      });

      // #then returns error (signature validation fails during tx build)
      if (!error) {
        // If no API error, tx should fail on-chain
        try {
          await signAndSubmitTransactionData(
            ctx.connection,
            data.unsignedTransactionData,
            claimer,
          );
          expect.fail("Expected transaction to fail with invalid signature");
        } catch (txError: unknown) {
          expect((txError as Error).message).to.include("signature");
        }
      }
    });

    it("claims a pending contract with valid signature", async () => {
      // #given pending contract with valid invite
      const entityPubKey = TEST_HOTSPOT_ENTITY_KEY;
      const delegate = ctx.payer;
      const claimer = Keypair.generate();

      // Fund claimer for ATA creation
      await ensureFunds(claimer.publicKey, 0.01 * LAMPORTS_PER_SOL);

      // Generate invite
      const inviteResult = await ctx.client.rewardContract.invite({
        entityPubKey,
        signerWalletAddress: delegate.publicKey.toBase58(),
      });

      // Sign the invite message
      const message = Buffer.from(inviteResult.unsignedMessage);
      const sig = nacl.sign.detached(message, delegate.secretKey);
      const signatureB64 = Buffer.from(sig).toString("base64");

      // #when claiming with signed invite
      const { data, error } = await ctx.safeClient.rewardContract.claim({
        entityPubKey,
        signerWalletAddress: claimer.publicKey.toBase58(),
        delegateSignature: signatureB64,
        expiration: inviteResult.expiration,
      });

      // #then returns valid transaction
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(
        data?.unsignedTransactionData?.transactions?.[0]?.serializedTransaction,
      ).to.be.a("string");

      // #then tx submits successfully
      await signAndSubmitTransactionData(
        ctx.connection,
        data.unsignedTransactionData,
        claimer,
      );
    });

    it("rejects expired invite", async () => {
      // #given expired invite
      const entityPubKey = TEST_HOTSPOT_ENTITY_KEY;
      const claimer = Keypair.generate();
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // #when claiming with expired invite
      const { error } = await ctx.safeClient.rewardContract.claim({
        entityPubKey,
        signerWalletAddress: claimer.publicKey.toBase58(),
        delegateSignature: "invalidBase64Signature==",
        expiration: pastDate,
      });

      // #then returns BAD_REQUEST
      if (!isDefinedError(error)) {
        expect.fail(
          `Expected defined ORPCError - but got: ${JSON.stringify(error)}`,
        );
      }
      expect(error.code).to.equal("BAD_REQUEST");
      expect(error.message).to.include("expired");
    });

    it("returns 404 when no contract exists to claim", async () => {
      // #given random hotspot without contract
      const randomEntityKey = Keypair.generate().publicKey.toBase58();
      const claimer = Keypair.generate();
      const futureDate = new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ).toISOString();

      // #when claiming non-existent contract
      const { error } = await ctx.safeClient.rewardContract.claim({
        entityPubKey: randomEntityKey,
        signerWalletAddress: claimer.publicKey.toBase58(),
        delegateSignature: "dummySignature==",
        expiration: futureDate,
      });

      // #then returns NOT_FOUND
      if (!isDefinedError(error)) {
        expect.fail(
          `Expected defined ORPCError - but got: ${JSON.stringify(error)}`,
        );
      }
      expect(error.code).to.equal("NOT_FOUND");
    });
  });

  describe("delete", () => {
    before(async () => {
      await ensureNoContract(ctx, TEST_HOTSPOT_ENTITY_KEY);
    });

    it("returns 404 when no contract exists", async () => {
      // #given hotspot without contract (ensured by before hook)
      const entityPubKey = TEST_HOTSPOT_ENTITY_KEY;
      const walletAddress = ctx.payer.publicKey.toBase58();

      // #when deleting non-existent contract
      const { error } = await ctx.safeClient.rewardContract.delete({
        entityPubKey,
        signerWalletAddress: walletAddress,
      });

      // #then returns NOT_FOUND
      if (!isDefinedError(error)) {
        expect.fail(
          `Expected defined ORPCError - but got: ${JSON.stringify(error)}`,
        );
      }
      expect(error.code).to.equal("NOT_FOUND");
    });

    it("returns 403 when wallet is not the delegate", async () => {
      // #given create a new contract first
      const entityPubKey = TEST_HOTSPOT_ENTITY_KEY;
      const walletAddress = ctx.payer.publicKey.toBase58();

      await ctx.client.rewardContract
        .create({
          entityPubKey,
          signerWalletAddress: walletAddress,
          delegateWalletAddress: walletAddress,
          recipients: [
            {
              type: "CLAIMABLE",
              giftedCurrency: {
                amount: "1000000",
                mint: NATIVE_MINT.toBase58(),
              },
              receives: { type: "SHARES", shares: 100 },
            },
          ],
          rewardSchedule: "0 0 1,15 * *",
        })
        .then((res: any) =>
          signAndSubmitTransactionData(
            ctx.connection,
            res.unsignedTransactionData,
            ctx.payer,
          ),
        );

      // #when trying to delete with wrong wallet
      const wrongWallet = Keypair.generate().publicKey.toBase58();
      const { error } = await ctx.safeClient.rewardContract.delete({
        entityPubKey,
        signerWalletAddress: wrongWallet,
      });

      // #then returns UNAUTHORIZED
      if (!isDefinedError(error)) {
        expect.fail(
          `Expected defined ORPCError - but got: ${JSON.stringify(error)}`,
        );
      }
      expect(error.code).to.equal("UNAUTHORIZED");
    });

    it("deletes a pending reward contract", async () => {
      // #given hotspot with pending contract (created in previous test)
      const entityPubKey = TEST_HOTSPOT_ENTITY_KEY;
      const walletAddress = ctx.payer.publicKey.toBase58();

      // #when deleting contract
      const { data, error } = await ctx.safeClient.rewardContract.delete({
        entityPubKey,
        signerWalletAddress: walletAddress,
      });

      // #then returns valid transaction
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(
        data?.unsignedTransactionData?.transactions?.[0]?.serializedTransaction,
      ).to.be.a("string");

      // #then tx submits successfully
      await signAndSubmitTransactionData(
        ctx.connection,
        data.unsignedTransactionData,
        ctx.payer,
      );

      // #then contract no longer exists
      const { data: findResult } = await ctx.safeClient.rewardContract.find({
        entityPubKey,
      });
      expect(findResult?.status).to.equal("NONE");
    });

    it("resets compression destination when deleting active contract", async () => {
      // #given an ACTIVE contract (PRESET only, no CLAIMABLE)
      const entityPubKey = TEST_HOTSPOT_ENTITY_KEY;
      const walletAddress = ctx.payer.publicKey.toBase58();
      const secondWallet = Keypair.generate().publicKey.toBase58();

      // Clean up any existing contract
      await ensureNoContract(ctx, entityPubKey);

      // Create ACTIVE contract (PRESET only = no welcome pack = ACTIVE immediately)
      const createResult = await ctx.client.rewardContract.create({
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
        rewardSchedule: "0 0 1,15 * *",
      });
      await signAndSubmitTransactionData(
        ctx.connection,
        createResult.unsignedTransactionData,
        ctx.payer,
      );

      // Verify contract is ACTIVE and destination is set
      const provider = new AnchorProvider(
        ctx.connection,
        {
          publicKey: ctx.payer.publicKey,
          signAllTransactions: async () => {
            throw new Error("not supported");
          },
          signTransaction: async () => {
            throw new Error("not supported");
          },
        } as any,
        AnchorProvider.defaultOptions(),
      );

      // Get asset ID from on-chain keyToAsset account
      const hemProgram = await initHem(provider);
      const [keyToAssetK] = keyToAssetKey(daoKey(HNT_MINT)[0], entityPubKey);
      const keyToAsset =
        await hemProgram.account.keyToAssetV0.fetchNullable(keyToAssetK);
      expect(keyToAsset).to.exist;
      const assetPubkey = keyToAsset!.asset;

      // HNT Lazy Distributor address (mainnet)
      const HNT_LAZY_DISTRIBUTOR = new PublicKey(
        "6gcZXjHgKUBMedc2V1aZLFPwh8M1rPVRw7kpo2KqNrFq",
      );
      const ldProgram = await initLd(provider);
      const [recipientK] = recipientKey(HNT_LAZY_DISTRIBUTOR, assetPubkey);

      const recipientBefore =
        await ldProgram.account.recipientV0.fetchNullable(recipientK);
      expect(recipientBefore).to.exist;
      expect(recipientBefore!.destination.equals(PublicKey.default)).to.be
        .false;

      // #when deleting the active contract
      const { data, error } = await ctx.safeClient.rewardContract.delete({
        entityPubKey,
        signerWalletAddress: walletAddress,
      });
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      await signAndSubmitTransactionData(
        ctx.connection,
        data.unsignedTransactionData,
        ctx.payer,
      );

      // #then compression destination is reset to PublicKey.default
      const recipientAfter =
        await ldProgram.account.recipientV0.fetchNullable(recipientK);
      expect(recipientAfter).to.exist;
      expect(recipientAfter!.destination.equals(PublicKey.default)).to.be.true;
    });
  });

  describe("create (PRESET only)", () => {
    it("creates an active reward contract when no CLAIMABLE recipient", async () => {
      // #given clean hotspot (delete any existing contract)
      const entityPubKey = TEST_HOTSPOT_ENTITY_KEY;
      const walletAddress = ctx.payer.publicKey.toBase58();
      const secondWallet = Keypair.generate().publicKey.toBase58();

      await ensureNoContract(ctx, entityPubKey);

      // #when creating contract with only PRESET recipients
      const { data, error } = await ctx.safeClient.rewardContract.create({
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

      // #then returns valid unsigned transaction
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(
        data?.unsignedTransactionData?.transactions?.[0]?.serializedTransaction,
      ).to.be.a("string");

      // #then tx submits successfully
      await signAndSubmitTransactionData(
        ctx.connection,
        data.unsignedTransactionData,
        ctx.payer,
      );

      // #then find returns ACTIVE with correct contract shape
      const { data: findResult } = await ctx.safeClient.rewardContract.find({
        entityPubKey,
      });
      expect(findResult?.status).to.equal("ACTIVE");
      if (findResult?.status === "ACTIVE") {
        expect(findResult.contract?.recipients).to.have.length(2);
      }
    });
  });
});
