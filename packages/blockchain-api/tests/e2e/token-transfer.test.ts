import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { expect } from "chai";
import { after, before, describe, it } from "mocha";
import { applyMinimalServerEnv } from "./helpers/env";
import { ensureNextServer, stopNextServer } from "./helpers/next";
import {
  ensureSurfpool,
  getSurfpoolRpcUrl,
  stopSurfpool,
} from "./helpers/surfpool";
import {
  ensureFunds,
  ensureTokenBalance,
  loadKeypairFromEnv,
} from "./helpers/wallet";
import { signAndSubmitTransactionData } from "./helpers/tx";
import { TOKEN_MINTS } from "../../src/lib/constants/tokens";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { appRouter } from "@/server/api";
import type { RouterClient } from "@orpc/server";
import { ORPCError } from "@orpc/server";

describe("token-transfer", () => {
  let payer: Keypair;
  let connection: Connection;
  let client: RouterClient<typeof appRouter>;

  before(async () => {
    applyMinimalServerEnv();
    await ensureSurfpool();
    await ensureNextServer();
    payer = loadKeypairFromEnv();
    connection = new Connection(getSurfpoolRpcUrl(), "confirmed");
    await ensureFunds(payer.publicKey, 1 * LAMPORTS_PER_SOL);
    const usdcMint = new PublicKey(TOKEN_MINTS.USDC);
    await ensureTokenBalance(payer.publicKey, usdcMint, 10);

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

  it("transfers SOL to another wallet", async () => {
    const walletAddress = payer.publicKey.toBase58();
    const recipient = Keypair.generate();
    const lamports = 10_000_000; // 0.01 SOL

    const beforeBalance = await connection.getBalance(recipient.publicKey);

    const result = await client.tokens.transfer({
      walletAddress,
      destination: recipient.publicKey.toBase58(),
      tokenAmount: { amount: String(lamports), mint: TOKEN_MINTS.WSOL },
    });

    expect(
      result?.transactionData?.transactions?.[0]?.serializedTransaction,
    ).to.be.a("string");
    expect(result?.transactionData?.tag).to.be.a("string");
    expect(result?.transactionData?.parallel).to.equal(false);

    const txData = result.transactionData.transactions[0];
    expect(txData.metadata?.type).to.equal("token_transfer");
    expect(txData.metadata?.description).to.include("Transfer");

    // Verify enriched per-transaction metadata
    expect(txData.metadata?.tokenAmount).to.deep.include({
      amount: String(lamports),
      mint: TOKEN_MINTS.WSOL,
    });
    expect(txData.metadata?.tokenName).to.equal("SOL");
    expect(txData.metadata?.recipient).to.equal(recipient.publicKey.toBase58());

    // Verify batch-level actionMetadata
    const actionMeta = result.transactionData.actionMetadata as any;
    expect(actionMeta.type).to.equal("token_transfer");
    expect(actionMeta.tokenAmount).to.deep.include({
      amount: String(lamports),
      mint: TOKEN_MINTS.WSOL,
    });
    expect(actionMeta.tokenName).to.equal("SOL");
    expect(actionMeta.recipient).to.equal(recipient.publicKey.toBase58());

    await signAndSubmitTransactionData(
      connection,
      result.transactionData,
      payer,
    );

    const afterBalance = await connection.getBalance(recipient.publicKey);
    expect(afterBalance - beforeBalance).to.equal(lamports);
  });

  it("transfers SPL token to another wallet", async () => {
    const walletAddress = payer.publicKey.toBase58();
    const recipient = Keypair.generate();
    const rawAmount = 1_500_000; // 1.5 USDC (6 decimals)

    const result = await client.tokens.transfer({
      walletAddress,
      destination: recipient.publicKey.toBase58(),
      tokenAmount: { amount: String(rawAmount), mint: TOKEN_MINTS.USDC },
    });

    expect(
      result?.transactionData?.transactions?.[0]?.serializedTransaction,
    ).to.be.a("string");
    expect(result?.transactionData?.tag).to.be.a("string");

    const txData = result.transactionData.transactions[0];
    expect(txData.metadata?.type).to.equal("token_transfer");

    // Verify enriched per-transaction metadata
    expect(txData.metadata?.tokenAmount).to.deep.include({
      amount: String(rawAmount),
      mint: TOKEN_MINTS.USDC,
    });
    expect(txData.metadata?.tokenName).to.equal("USDC");
    expect(txData.metadata?.recipient).to.equal(recipient.publicKey.toBase58());

    // Verify batch-level actionMetadata
    const actionMeta = result.transactionData.actionMetadata as any;
    expect(actionMeta.type).to.equal("token_transfer");
    expect(actionMeta.tokenAmount).to.deep.include({
      amount: String(rawAmount),
      mint: TOKEN_MINTS.USDC,
    });
    expect(actionMeta.tokenName).to.equal("USDC");
    expect(actionMeta.recipient).to.equal(recipient.publicKey.toBase58());

    await signAndSubmitTransactionData(
      connection,
      result.transactionData,
      payer,
    );

    const mintKey = new PublicKey(TOKEN_MINTS.USDC);
    const recipientAta = getAssociatedTokenAddressSync(
      mintKey,
      recipient.publicKey,
      true,
    );
    const tokenAccount = await getAccount(connection, recipientAta);
    expect(Number(tokenAccount.amount)).to.equal(rawAmount);
  });

  it("returns 400 for invalid amount", async () => {
    const walletAddress = payer.publicKey.toBase58();
    const recipient = Keypair.generate().publicKey.toBase58();

    try {
      await client.tokens.transfer({
        walletAddress,
        destination: recipient,
        tokenAmount: { amount: "-5", mint: TOKEN_MINTS.WSOL },
      });
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      expect(error).to.be.instanceOf(ORPCError);
      expect(error.code).to.equal("BAD_REQUEST");
      expect(error.message).to.equal("Input validation failed");
    }
  });

  it("returns 400 for zero amount", async () => {
    const walletAddress = payer.publicKey.toBase58();
    const recipient = Keypair.generate().publicKey.toBase58();

    try {
      await client.tokens.transfer({
        walletAddress,
        destination: recipient,
        tokenAmount: { amount: "0", mint: TOKEN_MINTS.WSOL },
      });
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      expect(error).to.be.instanceOf(ORPCError);
      expect(error.code).to.equal("BAD_REQUEST");
      expect(error.message).to.include("Amount must be greater than 0");
    }
  });

  it("returns 400 for missing destination", async () => {
    const walletAddress = payer.publicKey.toBase58();

    try {
      await (client.tokens.transfer as any)({
        walletAddress,
        tokenAmount: { amount: "10000000", mint: TOKEN_MINTS.WSOL },
      });
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      expect(error).to.be.instanceOf(ORPCError);
      expect(error.code).to.equal("BAD_REQUEST");
    }
  });

  it("returns 400 for invalid destination pubkey", async () => {
    const walletAddress = payer.publicKey.toBase58();

    try {
      await client.tokens.transfer({
        walletAddress,
        destination: "invalid-pubkey",
        tokenAmount: { amount: "10000000", mint: TOKEN_MINTS.WSOL },
      });
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      expect(error).to.be.instanceOf(ORPCError);
      expect(error.code).to.equal("BAD_REQUEST");
    }
  });
});
