import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import {
  getAccount,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
} from "@solana/spl-token";
import { AnchorProvider } from "@coral-xyz/anchor";
import { init as initWelcomePack } from "@helium/welcome-pack-sdk";
import { init as initVsr, positionKey } from "@helium/voter-stake-registry-sdk";
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
import {
  TEST_HOTSPOT_ENTITY_KEY,
  TEST_HOTSPOT_2_ENTITY_KEY,
  TEST_HOTSPOT_2_ASSET_ID,
  HNT_LAZY_DISTRIBUTOR_ADDRESS,
} from "./helpers/constants";
import { ensureNoContract } from "./helpers/reward-contract";
import { createAndFundPosition } from "./helpers/governance";
import { signAndSubmitTransactionData } from "./helpers/tx";
import type { TestCtx } from "./helpers/context";
import fs from "fs";

// Set a raw token account into a frozen state, mimicking DC tokens (which the
// data credits program keeps frozen). surfpool's setTokenAccount accepts a
// `state` field alongside the balance.
async function setFrozenTokenAccount(
  owner: PublicKey,
  mint: PublicKey,
  amount: number
): Promise<void> {
  const res = await fetch(getSurfpoolRpcUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "surfnet_setTokenAccount",
      params: [
        owner.toBase58(),
        mint.toBase58(),
        { amount, state: "frozen" },
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      ],
    }),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(`setTokenAccount failed: ${JSON.stringify(json.error)}`);
  }
}

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

    // Disable rate limiting for the default tests; the rate-limit test opts in
    // per-call. Read lazily from process.env by the migrate handler.
    process.env.MIGRATION_RATE_LIMIT_PER_PAIR = "0";
    process.env.MIGRATION_RATE_LIMIT_PER_IP = "0";

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
    await stopNextServer();
    await stopSurfpool();
  });

  it("allows a wallet not on any allowlist to migrate", async () => {
    const randomWallet = Keypair.generate();

    // No allowlist, no password — migration is open. An empty request yields no
    // transactions but must not be rejected.
    const result = await client.migration.migrate({
      sourceWallet: randomWallet.publicKey.toBase58(),
      destinationWallet: destination.publicKey.toBase58(),
      hotspots: [],
      tokens: [],
    });

    expect(result.transactionData).to.not.be.undefined;
    expect(result.transactionData.transactions.length).to.equal(0);
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
    await signAndSubmitTransactionData(
      connection,
      result.transactionData,
      payer
    );

    const afterBalance = await connection.getBalance(destination.publicKey);
    expect(afterBalance - beforeBalance).to.equal(lamports);
  });

  it("migrates SPL token (USDC) to destination", async () => {
    const mintKey = new PublicKey(TOKEN_MINTS.USDC);
    const sourceAta = getAssociatedTokenAddressSync(
      mintKey,
      payer.publicKey,
      true
    );
    const sourceBalance = (await getAccount(connection, sourceAta)).amount;
    expect(Number(sourceBalance)).to.be.greaterThan(0);

    const destAta = getAssociatedTokenAddressSync(
      mintKey,
      destination.publicKey,
      true
    );
    let beforeDest = BigInt(0);
    try {
      beforeDest = (await getAccount(connection, destAta)).amount;
    } catch {
      // dest ATA may not exist yet
    }

    const result = await client.migration.migrate({
      sourceWallet: payer.publicKey.toBase58(),
      destinationWallet: destination.publicKey.toBase58(),
      hotspots: [],
      tokens: [{ mint: TOKEN_MINTS.USDC, amount: String(sourceBalance) }],
    });

    expect(result.transactionData.transactions.length).to.be.greaterThan(0);

    const txData = result.transactionData.transactions[0];
    expect(txData.metadata?.type).to.equal("migration");

    // Sign and submit
    await signAndSubmitTransactionData(
      connection,
      result.transactionData,
      payer
    );

    const afterDest = (await getAccount(connection, destAta)).amount;
    expect(Number(afterDest - beforeDest)).to.equal(Number(sourceBalance));
  });

  it("ignores a client-supplied amount (even 0) and migrates the full SPL balance", async () => {
    const fullRaw = 4_000_000; // 4 USDC (6 decimals)
    const usdcMint = new PublicKey(TOKEN_MINTS.USDC);
    await ensureTokenBalance(payer.publicKey, usdcMint, 4);

    const destAta = getAssociatedTokenAddressSync(
      usdcMint,
      destination.publicKey,
      true
    );
    let beforeDest = BigInt(0);
    try {
      beforeDest = (await getAccount(connection, destAta)).amount;
    } catch {
      // dest ATA may not exist yet
    }

    // Request 0 — the SPL amount is advisory, so the server must ignore it and
    // move the full on-chain balance rather than skipping the token.
    const result = await client.migration.migrate({
      sourceWallet: payer.publicKey.toBase58(),
      destinationWallet: destination.publicKey.toBase58(),
      hotspots: [],
      tokens: [{ mint: TOKEN_MINTS.USDC, amount: "0" }],
    });

    await signAndSubmitTransactionData(
      connection,
      result.transactionData,
      payer
    );

    const afterDest = (await getAccount(connection, destAta)).amount;
    expect(Number(afterDest - beforeDest)).to.equal(fullRaw);

    // Source ATA is unconditionally closed (rent refunded to fee payer).
    const sourceAta = getAssociatedTokenAddressSync(
      usdcMint,
      payer.publicKey,
      true
    );
    let sourceClosed = false;
    try {
      await getAccount(connection, sourceAta);
    } catch {
      sourceClosed = true;
    }
    expect(sourceClosed).to.equal(true);
  });

  it("skips a frozen source token account without creating a dest ATA (DC leak fix)", async () => {
    const frozenSource = Keypair.generate();
    const usdcMint = new PublicKey(TOKEN_MINTS.USDC);

    // Freeze a funded token account to mimic DC tokens, which the data credits
    // program keeps frozen.
    await setFrozenTokenAccount(frozenSource.publicKey, usdcMint, 3_000_000);

    const result = await client.migration.migrate({
      sourceWallet: frozenSource.publicKey.toBase58(),
      destinationWallet: destination.publicKey.toBase58(),
      hotspots: [],
      tokens: [{ mint: TOKEN_MINTS.USDC, amount: "1000000" }],
    });

    // Frozen token is skipped entirely — no dest-ATA create means no unrefunded
    // rent charged to the fee payer, so there are no transactions at all.
    expect(result.transactionData.transactions.length).to.equal(0);
    expect(result.warnings).to.be.an("array");
    expect(result.warnings!.some((w) => w.includes("frozen"))).to.equal(true);
  });

  it("rate limits repeated migrations for the same wallet pair", async () => {
    const prev = process.env.MIGRATION_RATE_LIMIT_PER_PAIR;
    process.env.MIGRATION_RATE_LIMIT_PER_PAIR = "2";
    try {
      const src = Keypair.generate().publicKey.toBase58();
      const dst = Keypair.generate().publicKey.toBase58();
      const call = (source: string, dest: string) =>
        client.migration.migrate({
          sourceWallet: source,
          destinationWallet: dest,
          hotspots: [],
          tokens: [],
        });

      await call(src, dst);
      await call(src, dst);
      try {
        await call(src, dst);
        expect.fail("Should have been rate limited");
      } catch (error: any) {
        expect(error).to.be.instanceOf(ORPCError);
        expect(error.code).to.equal("RATE_LIMITED");
      }

      // A different pair is unaffected.
      const otherResult = await call(
        Keypair.generate().publicKey.toBase58(),
        dst
      );
      expect(otherResult.transactionData).to.not.be.undefined;
    } finally {
      process.env.MIGRATION_RATE_LIMIT_PER_PAIR = prev ?? "0";
    }
  });

  it("migrates a VSR governance position to destination", async () => {
    const positionDestination = Keypair.generate();

    // Create a position owned by the source wallet (payer)
    const { positionMint } = await createAndFundPosition(ctx, {
      amount: "100000000",
      lockupKind: "cliff",
      lockupPeriodsInDays: 30,
    });

    const positionMintPubkey = new PublicKey(positionMint);
    const [positionPubkey] = positionKey(positionMintPubkey);
    const sourceAta = getAssociatedTokenAddressSync(
      positionMintPubkey,
      payer.publicKey,
      true
    );
    const destAta = getAssociatedTokenAddressSync(
      positionMintPubkey,
      positionDestination.publicKey,
      true
    );

    // Source owns the position NFT in a frozen ATA before migration
    const sourceAtaBefore = await getAccount(connection, sourceAta);
    expect(Number(sourceAtaBefore.amount)).to.equal(1);
    expect(sourceAtaBefore.isFrozen).to.equal(true);

    // Snapshot PositionV0 state — the transfer must not alter it
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
      AnchorProvider.defaultOptions()
    );
    const vsrProgram = await initVsr(anchorProvider);
    const positionBefore = await vsrProgram.account.positionV0.fetch(
      positionPubkey
    );

    // No hotspots/tokens requested — positions are discovered server-side
    const result = await client.migration.migrate({
      sourceWallet: payer.publicKey.toBase58(),
      destinationWallet: positionDestination.publicKey.toBase58(),
      hotspots: [],
      tokens: [],
    });

    const migrationTxs = result.transactionData.transactions.filter(
      (t: any) => t.metadata?.description !== "Jito tip"
    );
    expect(migrationTxs.length).to.be.greaterThan(0);
    for (const t of migrationTxs) {
      expect(t.metadata?.type).to.equal("migration");
      expect(t.metadata?.signers).to.deep.equal(["source"]);
    }

    await signAndSubmitTransactionData(
      connection,
      result.transactionData,
      payer
    );

    // Destination holds the position NFT in a frozen ATA
    const destAtaAfter = await getAccount(connection, destAta);
    expect(Number(destAtaAfter.amount)).to.equal(1);
    expect(destAtaAfter.isFrozen).to.equal(true);

    // Source ATA is closed (rent refunded to fee payer)
    let sourceClosed = false;
    try {
      await getAccount(connection, sourceAta);
    } catch {
      sourceClosed = true;
    }
    expect(sourceClosed).to.equal(true);

    // PositionV0 account state is unchanged
    const positionAfter = await vsrProgram.account.positionV0.fetch(
      positionPubkey
    );
    expect(positionAfter.registrar.toBase58()).to.equal(
      positionBefore.registrar.toBase58()
    );
    expect(positionAfter.mint.toBase58()).to.equal(
      positionBefore.mint.toBase58()
    );
    expect(positionAfter.amountDepositedNative.toString()).to.equal(
      positionBefore.amountDepositedNative.toString()
    );
    expect(positionAfter.lockup.endTs.toString()).to.equal(
      positionBefore.lockup.endTs.toString()
    );
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
      payer
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
      AnchorProvider.defaultOptions()
    );
    const wpProgram = await initWelcomePack(anchorProvider);
    const fetched = await wpProgram.account.welcomePackV0.fetchNullable(
      new PublicKey(createResult.welcomePack.address)
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
      (t: any) => t.metadata?.description !== "Jito tip"
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
        `Failed to create reward contract: ${JSON.stringify(createError)}`
      );
    }
    await signAndSubmitTransactionData(
      connection,
      createResult.unsignedTransactionData,
      payer
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
      (t: any) => t.metadata?.description !== "Jito tip"
    );
    expect(migrationTxs.length).to.be.greaterThan(0);
    for (const t of migrationTxs) {
      expect(t.metadata?.type).to.equal("migration");
      expect(t.metadata?.signers).to.deep.equal(["source"]);
    }

    // Sign and submit — fee payer already signed server-side
    await signAndSubmitTransactionData(
      connection,
      result.transactionData,
      payer
    );
  });
});
