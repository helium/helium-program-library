import { Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { expect } from "chai";
import { after, before, describe, it } from "mocha";
import { isDefinedError } from "@orpc/client";
import { stopNextServer } from "./helpers/next";
import { stopSurfpool } from "./helpers/surfpool";
import { setupTestCtx, TestCtx } from "./helpers/context";
import { ensureTokenBalance } from "./helpers/wallet";
import { TOKEN_MINTS } from "../../src/lib/constants/tokens";

describe("data-credits", () => {
  let ctx: TestCtx;

  before(async () => {
    ctx = await setupTestCtx();
    // Ensure the payer has HNT to burn
    await ensureTokenBalance(
      ctx.payer.publicKey,
      new PublicKey(TOKEN_MINTS.HNT),
      10
    );
  });

  after(async () => {
    await stopNextServer();
    await stopSurfpool();
  });

  describe("mint", () => {
    it("returns 400 when neither dcAmount nor hntAmount is provided", async () => {
      const { error } = await ctx.safeClient.dataCredits.mint({
        owner: ctx.payer.publicKey.toBase58(),
      });

      if (!isDefinedError(error)) {
        expect.fail(
          `Expected defined ORPCError - but got: ${JSON.stringify(error)}`
        );
      }
      expect(error.code).to.equal("BAD_REQUEST");
      expect(error.message).to.include(
        "Either dcAmount or hntAmount must be provided"
      );
    });

    it("returns 400 when both dcAmount and hntAmount are provided", async () => {
      const { error } = await ctx.safeClient.dataCredits.mint({
        owner: ctx.payer.publicKey.toBase58(),
        dcAmount: "1000",
        hntAmount: "100000000",
      });

      if (!isDefinedError(error)) {
        expect.fail(
          `Expected defined ORPCError - but got: ${JSON.stringify(error)}`
        );
      }
      expect(error.code).to.equal("BAD_REQUEST");
      expect(error.message).to.include(
        "Provide only one of dcAmount or hntAmount"
      );
    });

    it("returns 400 for invalid owner address", async () => {
      const { error } = await ctx.safeClient.dataCredits.mint({
        owner: "invalid-pubkey",
        dcAmount: "1000",
      });

      if (!isDefinedError(error)) {
        expect.fail(
          `Expected defined ORPCError - but got: ${JSON.stringify(error)}`
        );
      }
      expect(error.code).to.equal("BAD_REQUEST");
    });

    it("builds mint transactions with dcAmount", async () => {
      const owner = ctx.payer.publicKey.toBase58();

      const { data, error } = await ctx.safeClient.dataCredits.mint({
        owner,
        dcAmount: "1000",
      });

      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }

      expect(data.transactions).to.be.an("array").with.length.greaterThan(0);
      expect(data.transactions[0].serializedTransaction).to.be.a("string");
      expect(data.parallel).to.equal(false);
      expect(data.tag).to.be.a("string");

      const metadata = data.transactions[0].metadata;
      expect(metadata?.type).to.equal("mint_data_credits");
      expect(metadata?.description).to.include("Mint 1000 data credits");
    });

    it("builds mint transactions with hntAmount", async () => {
      const owner = ctx.payer.publicKey.toBase58();

      const { data, error } = await ctx.safeClient.dataCredits.mint({
        owner,
        hntAmount: "100000000", // 1 HNT in bones
      });

      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }

      expect(data.transactions).to.be.an("array").with.length.greaterThan(0);
      expect(data.transactions[0].serializedTransaction).to.be.a("string");
      expect(data.parallel).to.equal(false);
      expect(data.tag).to.be.a("string");

      const metadata = data.transactions[0].metadata;
      expect(metadata?.type).to.equal("mint_data_credits");
      expect(metadata?.description).to.include("Burn 100000000 HNT bones");
    });

    it("builds mint transactions with a custom recipient", async () => {
      const owner = ctx.payer.publicKey.toBase58();
      const recipient = Keypair.generate().publicKey.toBase58();

      const { data, error } = await ctx.safeClient.dataCredits.mint({
        owner,
        dcAmount: "500",
        recipient,
      });

      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }

      expect(data.transactions).to.be.an("array").with.length.greaterThan(0);
      expect(data.transactions[0].serializedTransaction).to.be.a("string");
    });

    // Note: On-chain submission of mintDataCredits transactions fails in surfpool
    // because PythSolanaReceiver creates transactions with ephemeral signers whose
    // signatures don't pass surfpool's signature verification. Instead, we verify
    // the transaction structure is valid (deserializable, correct fee payer, etc.).
    it("returns valid deserializable transactions with correct fee payer", async () => {
      const owner = ctx.payer.publicKey.toBase58();

      const { data, error } = await ctx.safeClient.dataCredits.mint({
        owner,
        dcAmount: "1000",
      });

      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }

      // Verify each transaction is deserializable and has the correct fee payer
      for (const t of data.transactions) {
        const tx = VersionedTransaction.deserialize(
          Buffer.from(t.serializedTransaction, "base64")
        );
        // Fee payer is the first static account key
        const feePayer = tx.message.staticAccountKeys[0];
        expect(feePayer.toBase58()).to.equal(owner);
        // Should have signature slots
        expect(tx.signatures.length).to.be.greaterThan(0);
        // Should have a valid recent blockhash
        expect(tx.message.recentBlockhash).to.be.a("string");
      }
    });
  });
});
