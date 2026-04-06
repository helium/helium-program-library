import { AnchorProvider } from "@coral-xyz/anchor";
import { init as initLd } from "@helium/lazy-distributor-sdk";
import { TASK_QUEUE_ID } from "@helium/hpl-crons-sdk";
import { init as initTuktuk, nextAvailableTaskIds } from "@helium/tuktuk-sdk";
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
import {
  ensureSurfpool,
  getSurfpoolRpcUrl,
  stopSurfpool,
} from "./helpers/surfpool";
import {
  ensureFunds,
  loadKeypair2FromEnv,
  loadKeypairFromEnv,
} from "./helpers/wallet";
import { signAndSubmitTransactionData } from "./helpers/tx";
import { runAllTasks } from "./helpers/tuktuk";
import { sleep } from "@helium/spl-utils";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { appRouter } from "@/server/api";
import type { RouterClient } from "@orpc/server";

describe("rewards endpoints", () => {
  let payer: Keypair;
  let payer2: Keypair;
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
    payer2 = loadKeypair2FromEnv();
    connection = new Connection(getSurfpoolRpcUrl(), "confirmed");
    await ensureFunds(payer.publicKey, 0.05 * LAMPORTS_PER_SOL);

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

  it("gets pending rewards for a wallet", async () => {
    // Use known recipient to derive wallet to check
    const recipientAddress = "V8bBcfi1ygYXop6cTwtFauUyTvLXXWxRxmBwwfJ7mdC";
    const provider = new AnchorProvider(
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
    const ldProgram = await initLd(provider);
    const beforeAcc = await ldProgram.account.recipientV0.fetch(
      new PublicKey(recipientAddress)
    );
    const walletAddress = beforeAcc.destination.toBase58();

    const result = await client.hotspots.getPendingRewards({ walletAddress });
    expect(result.pending.total).to.have.property("amount");
    expect(result.pending.total).to.have.property("mint");
  });

  it("claims rewards via tuktuk", async () => {
    const recipientAddress = "V8bBcfi1ygYXop6cTwtFauUyTvLXXWxRxmBwwfJ7mdC";
    const provider = new AnchorProvider(
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
    const ldProgram = await initLd(provider);
    const recipientPk = new PublicKey(recipientAddress);
    const beforeAcc = await ldProgram.account.recipientV0.fetch(recipientPk);
    const beforeTotal = BigInt(beforeAcc.totalRewards.toString());

    const walletAddress = payer.publicKey.toBase58();

    // #given — fetch pending rewards to pass as estimated amount
    const pendingResult = await client.hotspots.getPendingRewards({
      walletAddress,
    });
    const estimatedPendingRewards = pendingResult.pending.claimable;

    // #when
    const result = await client.hotspots.claimRewards({
      walletAddress,
      tuktuk: true,
      estimatedPendingRewards,
    });
    const taskId = (result?.transactionData?.transactions?.[0]?.metadata as any)
      ?.taskIds?.[0];

    // #then
    expect(
      result?.transactionData?.transactions?.[0]?.serializedTransaction
    ).to.be.a("string");

    // Verify batch-level actionMetadata
    expect(result.transactionData.actionMetadata).to.deep.include({
      type: "queue_wallet_claim",
      network: "all",
    });
    expect(result.transactionData.actionMetadata?.hotspotCount)
      .to.be.a("number")
      .and.be.greaterThan(0);

    // Verify estimatedPendingRewards is passed through
    const meta = result.transactionData.actionMetadata as any;
    expect(meta.estimatedPendingRewards).to.deep.equal(estimatedPendingRewards);

    // Submit transactions
    await signAndSubmitTransactionData(
      connection,
      result.transactionData,
      payer
    );

    const tuktukProgram = await initTuktuk(provider);
    const crankTurner = Keypair.generate();
    // Run through all the possible claim tasks
    await ensureFunds(crankTurner.publicKey, 0.05 * LAMPORTS_PER_SOL);
    console.log("Running queue claim jobs tasks");
    const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(
      TASK_QUEUE_ID
    );
    let nextAvailable = nextAvailableTaskIds(taskQueueAcc.taskBitmap, 6);
    await runAllTasks(
      provider,
      tuktukProgram,
      TASK_QUEUE_ID,
      crankTurner,
      [taskId],
      nextAvailable
    );
    await sleep(2000);
    let prevAvailable = nextAvailable;
    nextAvailable = nextAvailableTaskIds(taskQueueAcc.taskBitmap, 6);
    await runAllTasks(
      provider,
      tuktukProgram,
      TASK_QUEUE_ID,
      crankTurner,
      prevAvailable,
      nextAvailable
    );
    await sleep(2000);

    // Re-fetch recipient and verify increase
    const afterAcc = await ldProgram.account.recipientV0.fetch(recipientPk);
    const afterTotal = BigInt(afterAcc.totalRewards.toString());
    const delta = afterTotal - beforeTotal;
    expect(delta).to.equal(BigInt(100000000));
  });

  it("claims rewards not via tuktuk", async () => {
    const recipientAddress = "B7cbb7H5EP5EAoX5NFi9CTQ7BE2yJ2Z9m87eCZ4P2RcU";
    const provider = new AnchorProvider(
      connection,
      {
        publicKey: payer2.publicKey,
        signAllTransactions: async () => {
          throw new Error("not supported in test");
        },
        signTransaction: async () => {
          throw new Error("not supported in test");
        },
      } as any,
      AnchorProvider.defaultOptions()
    );
    const ldProgram = await initLd(provider);
    const recipientPk = new PublicKey(recipientAddress);
    const beforeAcc = await ldProgram.account.recipientV0.fetchNullable(
      recipientPk
    );
    const beforeTotal = BigInt(beforeAcc?.totalRewards.toString() || "0");

    const walletAddress = payer2.publicKey.toBase58();

    // #given — fetch pending rewards to pass as estimated amount
    const pendingResult = await client.hotspots.getPendingRewards({
      walletAddress,
    });
    const estimatedPendingRewards = pendingResult.pending.claimable;

    // #when
    const result = await client.hotspots.claimRewards({
      walletAddress,
      estimatedPendingRewards,
    });

    // #then
    expect(
      result?.transactionData?.transactions?.[0]?.serializedTransaction
    ).to.be.a("string");

    // Verify estimatedPendingRewards is passed through
    const meta = result.transactionData.actionMetadata as any;
    expect(meta.estimatedPendingRewards).to.deep.equal(estimatedPendingRewards);

    // Submit transactions
    await signAndSubmitTransactionData(
      connection,
      result.transactionData,
      payer2
    );
    await sleep(2000);

    // Re-fetch recipient and verify increase
    const afterAcc = await ldProgram.account.recipientV0.fetch(recipientPk);
    const afterTotal = BigInt(afterAcc.totalRewards.toString());
    const delta = afterTotal - beforeTotal;
    expect(delta).to.equal(BigInt(502501516));
  });
});
