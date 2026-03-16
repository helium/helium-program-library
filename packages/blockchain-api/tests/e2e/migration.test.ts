import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync, NATIVE_MINT } from "@solana/spl-token";
import { AnchorProvider } from "@coral-xyz/anchor";
import { init as initWelcomePack } from "@helium/welcome-pack-sdk";
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
import { TOKEN_MINTS } from "../../src/lib/constants/tokens";
import { createORPCClient, createSafeClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { appRouter } from "@/server/api";
import type { RouterClient } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import { TEST_HOTSPOT_ENTITY_KEY, TEST_HOTSPOT_2_ENTITY_KEY, TEST_HOTSPOT_2_ASSET_ID, HNT_LAZY_DISTRIBUTOR_ADDRESS } from "./helpers/constants";
import { ensureNoContract } from "./helpers/reward-contract";
import { signAndSubmitTransactionData } from "./helpers/tx";
import type { TestCtx } from "./helpers/context";
import fs from "fs";

describe("migration", () => {
  let payer: Keypair;
  let destination: Keypair;
  let connection: Connection;
  let client: RouterClient<typeof appRouter>;
  let safeClient: ReturnType<
    typeof createSafeClient<RouterClient<typeof appRouter>>
  >;
  let ctx: TestCtx;

  before(async () => {
    applyMinimalServerEnv();
    payer = loadKeypairFromEnv();
    destination = Keypair.generate();

    // Add payer to migration allowlist via JSON file (shared with Next.js server process)
    const allowlistPath = "/tmp/test-migration-allowlist.json";
    fs.writeFileSync(allowlistPath, JSON.stringify([payer.publicKey.toBase58()]));
    process.env.MIGRATION_ALLOWLIST_PATH = allowlistPath;

    // Set Jito tip account fallback (Jito API not available in test env)
    process.env.JITO_TIP_ACCOUNT = destination.publicKey.toBase58();

    // Set up fee payer — must be set before ensureNextServer so the server's env picks it up
    const keyPath =
      process.env.TEST_WALLET_KEYPAIR_PATH || "/tmp/test-fee-payer.json";
    if (!process.env.TEST_WALLET_KEYPAIR_PATH) {
      fs.writeFileSync(keyPath, JSON.stringify(Array.from(payer.secretKey)));
    }
    process.env.FEE_PAYER_WALLET_PATH = keyPath;

    await ensureSurfpool();
    await ensureNextServer();
    connection = new Connection(getSurfpoolRpcUrl(), "confirmed");

    // Ensure payer has funds
    await ensureFunds(payer.publicKey, 1 * LAMPORTS_PER_SOL);

    // Ensure payer has USDC
    const usdcMint = new PublicKey(TOKEN_MINTS.USDC);
    await ensureTokenBalance(payer.publicKey, usdcMint, 10);

    // Create ORPC client
    const link = new RPCLink({
      url: "http://127.0.0.1:3000/rpc",
    });
    client = createORPCClient(link);
    safeClient = createSafeClient(client);

    // Minimal ctx for helper functions (ensureNoContract, etc.)
    ctx = { payer, connection, client, safeClient };
  });

  after(async () => {
    delete process.env.MIGRATION_ALLOWLIST_PATH;
    await stopNextServer();
    await stopSurfpool();
  });

  it("rejects wallet not in allowlist", async () => {
    const randomWallet = Keypair.generate();

    try {
      await client.migration.migrate({
        sourceWallet: randomWallet.publicKey.toBase58(),
        destinationWallet: destination.publicKey.toBase58(),
        hotspots: [],
        tokens: [],
      });
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      expect(error).to.be.instanceOf(ORPCError);
      expect(error.code).to.equal("UNAUTHORIZED");
      expect(error.message).to.include("not in the migration allowlist");
    }
  });

  it("migrates SOL to destination", async () => {
    const lamports = 10_000_000; // 0.01 SOL

    const beforeBalance = await connection.getBalance(destination.publicKey);

    const result = await client.migration.migrate({
      sourceWallet: payer.publicKey.toBase58(),
      destinationWallet: destination.publicKey.toBase58(),
      hotspots: [],
      tokens: [{ mint: TOKEN_MINTS.WSOL, amount: String(lamports) }],
    });

    expect(result.transactionData.transactions.length).to.be.greaterThan(0);
    expect(result.transactionData.parallel).to.equal(false);

    const txData = result.transactionData.transactions[0];
    expect(txData.metadata?.type).to.equal("migration");
    expect(txData.metadata?.signers).to.deep.include("source");

    // Sign and submit — fee payer already signed server-side
    await signAndSubmitTransactionData(connection, result.transactionData, payer);

    const afterBalance = await connection.getBalance(destination.publicKey);
    expect(afterBalance - beforeBalance).to.equal(lamports);
  });

  it("migrates SPL token (USDC) to destination", async () => {
    const rawAmount = 1_500_000; // 1.5 USDC (6 decimals)

    const result = await client.migration.migrate({
      sourceWallet: payer.publicKey.toBase58(),
      destinationWallet: destination.publicKey.toBase58(),
      hotspots: [],
      tokens: [{ mint: TOKEN_MINTS.USDC, amount: String(rawAmount) }],
    });

    expect(result.transactionData.transactions.length).to.be.greaterThan(0);

    const txData = result.transactionData.transactions[0];
    expect(txData.metadata?.type).to.equal("migration");

    // Sign and submit
    await signAndSubmitTransactionData(connection, result.transactionData, payer);

    const mintKey = new PublicKey(TOKEN_MINTS.USDC);
    const destAta = getAssociatedTokenAddressSync(
      mintKey,
      destination.publicKey,
      true,
    );
    const tokenAccount = await getAccount(connection, destAta);
    expect(Number(tokenAccount.amount)).to.equal(rawAmount);
  });

  it("migrates hotspot in welcome pack (closes pack and transfers)", async () => {
    const walletAddress = payer.publicKey.toBase58();

    // Create a welcome pack on the SECOND test hotspot (so it doesn't interfere with other tests)
    const createResult = await client.welcomePacks.create({
      walletAddress,
      assetId: TEST_HOTSPOT_2_ASSET_ID,
      solAmount: { amount: "10000000", mint: NATIVE_MINT.toBase58() },
      rentRefund: walletAddress,
      assetReturnAddress: walletAddress,
      rewardsSplit: [
        {
          address: walletAddress,
          type: "percentage" as const,
          amount: 100,
        },
      ],
      schedule: {
        frequency: "monthly" as const,
        time: "09:00",
        timezone: "America/New_York",
        dayOfMonth: "15",
      },
      lazyDistributor: HNT_LAZY_DISTRIBUTOR_ADDRESS,
    });

    expect(createResult.welcomePack.owner).to.equal(walletAddress);
    expect(createResult.welcomePack.asset).to.equal(TEST_HOTSPOT_2_ASSET_ID);

    await signAndSubmitTransactionData(
      connection,
      createResult.transactionData,
      payer,
    );

    // Verify welcome pack exists on-chain
    const anchorProvider = new AnchorProvider(
      connection,
      {
        publicKey: payer.publicKey,
        signAllTransactions: async () => {
          throw new Error("not supported in test");
        },
        signTransaction: async () => {
          throw new Error("not supported in test");
        },
      } as any,
      AnchorProvider.defaultOptions(),
    );
    const wpProgram = await initWelcomePack(anchorProvider);
    const fetched = await wpProgram.account.welcomePackV0.fetchNullable(
      new PublicKey(createResult.welcomePack.address),
    );
    expect(fetched).to.not.be.null;
    expect(fetched!.owner.toBase58()).to.equal(walletAddress);

    // Migrate the hotspot (in welcome pack) — should detect the pack and include close + transfer
    const result = await client.migration.migrate({
      sourceWallet: walletAddress,
      destinationWallet: destination.publicKey.toBase58(),
      hotspots: [TEST_HOTSPOT_2_ENTITY_KEY],
      tokens: [],
    });

    // Verify migration produced transactions with correct metadata
    expect(result.transactionData.transactions.length).to.be.greaterThan(0);
    expect(result.transactionData.parallel).to.equal(false);

    const migrationTxs = result.transactionData.transactions.filter(
      (t: any) => t.metadata?.description !== "Jito tip",
    );
    expect(migrationTxs.length).to.be.greaterThan(0);
    for (const t of migrationTxs) {
      expect(t.metadata?.type).to.equal("migration");
      expect(t.metadata?.signers).to.deep.equal(["source"]);
    }

    // NOTE: We don't submit the migration transactions on surfpool because creating
    // the welcome pack locally modifies the merkle tree, causing proof divergence from
    // mainnet DAS. In production, both the welcome pack and proofs live on mainnet,
    // so there is no divergence. The transaction structure verification above confirms
    // the procedure correctly detects the welcome pack and builds close + transfer txs.
  });

  it("migrates hotspot (no split) returns correct transaction data", async () => {
    // Ensure no existing reward contract / split on the hotspot
    await ensureNoContract(ctx, TEST_HOTSPOT_ENTITY_KEY);

    const result = await client.migration.migrate({
      sourceWallet: payer.publicKey.toBase58(),
      destinationWallet: destination.publicKey.toBase58(),
      hotspots: [TEST_HOTSPOT_ENTITY_KEY],
      tokens: [],

    });

    expect(result.transactionData.transactions.length).to.be.greaterThan(0);
    expect(result.transactionData.parallel).to.equal(false);

    // Simple hotspot transfer goes to group A (source-only signing)
    const txData = result.transactionData.transactions[0];
    expect(txData.metadata?.type).to.equal("migration");
    expect(txData.metadata?.signers).to.deep.equal(["source"]);

    // Don't submit — the next test creates a split then does the actual transfer
  });

  // IMPORTANT: This test must run LAST as it modifies Merkle tree state
  it("migrates hotspot with split to destination", async () => {
    // Ensure clean state
    await ensureNoContract(ctx, TEST_HOTSPOT_ENTITY_KEY);

    // Create a reward contract (PRESET only → creates miniFanoutV0 on chain)
    const walletAddress = payer.publicKey.toBase58();
    const secondWallet = Keypair.generate().publicKey.toBase58();
    const { data: createResult, error: createError } =
      await safeClient.rewardContract.create({
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
    if (createError) {
      expect.fail(
        `Failed to create reward contract: ${JSON.stringify(createError)}`,
      );
    }
    await signAndSubmitTransactionData(
      connection,
      createResult.unsignedTransactionData,
      payer,
    );

    // Now migrate the hotspot — procedure should detect the mini fanout on chain
    const result = await client.migration.migrate({
      sourceWallet: payer.publicKey.toBase58(),
      destinationWallet: destination.publicKey.toBase58(),
      hotspots: [TEST_HOTSPOT_ENTITY_KEY],
      tokens: [],

    });

    expect(result.transactionData.transactions.length).to.be.greaterThan(0);

    // Hotspot with split: fee payer acts as namespace signer (signed server-side),
    // source wallet signs as cNFT owner and old fanout owner. No destination signing needed.
    const migrationTxs = result.transactionData.transactions.filter(
      (t: any) => t.metadata?.description !== "Jito tip",
    );
    expect(migrationTxs.length).to.be.greaterThan(0);
    for (const t of migrationTxs) {
      expect(t.metadata?.type).to.equal("migration");
      expect(t.metadata?.signers).to.deep.equal(["source"]);
    }

    // Sign and submit — fee payer already signed server-side
    await signAndSubmitTransactionData(connection, result.transactionData, payer);
  });
});
