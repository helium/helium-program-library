import { Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { expect } from "chai";
import { after, before, describe, it } from "mocha";
import { isDefinedError } from "@orpc/client";
import { stopNextServer } from "./helpers/next";
import { stopSurfpool } from "./helpers/surfpool";
import { signAndSubmitTransactionData } from "./helpers/tx";
import { setupTestCtx, TestCtx } from "./helpers/context";
import { ensureTokenBalance } from "./helpers/wallet";
import { TOKEN_MINTS } from "../../src/lib/constants/tokens";

describe("data-credits", () => {
  let ctx: TestCtx;

  before(async () => {
    ctx = await setupTestCtx();
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
      expect(data.transactions[0].metadata?.type).to.equal("mint_data_credits");
    });

    it("builds mint transactions with hntAmount", async () => {
      const owner = ctx.payer.publicKey.toBase58();

      const { data, error } = await ctx.safeClient.dataCredits.mint({
        owner,
        hntAmount: "100000000",
      });

      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }

      expect(data.transactions).to.be.an("array").with.length.greaterThan(0);
      expect(data.transactions[0].metadata?.type).to.equal("mint_data_credits");
    });

    // Note: On-chain submission of mintDataCredits transactions fails in surfpool
    // because PythSolanaReceiver creates transactions with ephemeral signers whose
    // signatures don't pass surfpool's signature verification. We verify the
    // transaction is at least deserializable with the correct fee payer.
    it("returns deserializable transactions with correct fee payer", async () => {
      const owner = ctx.payer.publicKey.toBase58();

      const { data, error } = await ctx.safeClient.dataCredits.mint({
        owner,
        dcAmount: "1000",
      });

      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }

      for (const t of data.transactions) {
        const tx = VersionedTransaction.deserialize(
          Buffer.from(t.serializedTransaction, "base64")
        );
        expect(tx.message.staticAccountKeys[0].toBase58()).to.equal(owner);
      }
    });
  });

  describe("delegate", () => {
    before(async () => {
      await ensureTokenBalance(
        ctx.payer.publicKey,
        new PublicKey(TOKEN_MINTS.DC),
        10000
      );
    });

    it("returns 400 for invalid owner address", async () => {
      const { error } = await ctx.safeClient.dataCredits.delegate({
        owner: "invalid-pubkey",
        routerKey: "some-router-key",
        amount: "1000",
        mint: TOKEN_MINTS.MOBILE,
      });

      if (!isDefinedError(error)) {
        expect.fail(
          `Expected defined ORPCError - but got: ${JSON.stringify(error)}`
        );
      }
      expect(error.code).to.equal("BAD_REQUEST");
    });

    it("builds and submits a delegate transaction", async () => {
      const owner = ctx.payer.publicKey.toBase58();

      const { data, error } = await ctx.safeClient.dataCredits.delegate({
        owner,
        routerKey: "test-router-key-123",
        amount: "500",
        mint: TOKEN_MINTS.MOBILE,
      });

      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }

      expect(data.transactions).to.be.an("array").with.lengthOf(1);
      expect(data.parallel).to.equal(false);
      expect(data.tag).to.be.a("string");
      expect(data.transactions[0].metadata?.type).to.equal(
        "delegate_data_credits"
      );

      const sigs = await signAndSubmitTransactionData(
        ctx.connection,
        data,
        ctx.payer
      );
      expect(sigs).to.have.lengthOf(1);
    });

    it("builds and submits a delegate transaction with memo", async () => {
      const owner = ctx.payer.publicKey.toBase58();

      const { data, error } = await ctx.safeClient.dataCredits.delegate({
        owner,
        routerKey: "test-router-key-456",
        amount: "200",
        mint: TOKEN_MINTS.IOT,
        memo: "test memo",
      });

      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }

      const sigs = await signAndSubmitTransactionData(
        ctx.connection,
        data,
        ctx.payer
      );
      expect(sigs).to.have.lengthOf(1);
    });
  });
});
