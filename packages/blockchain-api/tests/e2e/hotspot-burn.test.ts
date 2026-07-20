import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";
import { after, before, describe, it } from "mocha";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { appRouter } from "@/server/api";
import type { RouterClient } from "@orpc/server";
import { applyMinimalServerEnv } from "./helpers/env";
import { ensureNextServer, stopNextServer } from "./helpers/next";
import {
  ensureSurfpool,
  getSurfpoolRpcUrl,
  stopSurfpool,
} from "./helpers/surfpool";
import { ensureFunds, loadKeypairFromEnv } from "./helpers/wallet";
import { signAndSubmitTransactionData } from "./helpers/tx";
import { TEST_HOTSPOT_ENTITY_KEY } from "./helpers/constants";

// Burning is destructive, so this runs strictly against the surfpool fork:
// the burn tx is submitted to 127.0.0.1:8899 and thrown away on teardown — the
// real hotspot on mainnet is never touched. TEST_HOTSPOT is owned by the test
// wallet on the freshly-forked mainnet state.
describe("hotspot burn (fork-only)", () => {
  let payer: Keypair;
  let connection: Connection;
  let client: RouterClient<typeof appRouter>;

  before(async () => {
    if (!process.env.ASSET_ENDPOINT) {
      throw new Error("ASSET_ENDPOINT is required for the burn test");
    }
    applyMinimalServerEnv();
    await ensureSurfpool();
    await ensureNextServer();

    payer = loadKeypairFromEnv();
    connection = new Connection(getSurfpoolRpcUrl(), "confirmed");
    await ensureFunds(payer.publicKey, 0.05 * LAMPORTS_PER_SOL);

    const link = new RPCLink({ url: "http://127.0.0.1:3000/rpc" });
    client = createORPCClient(link);
  });

  after(async () => {
    await stopNextServer();
    await stopSurfpool();
  });

  it("burns a hotspot on the fork (and a repeat burn fails)", async () => {
    const walletAddress = payer.publicKey.toBase58();

    // First burn: builds a valid bubblegum burn that confirms on the fork.
    const result = await client.hotspots.burnHotspot({
      walletAddress,
      hotspotPubkey: TEST_HOTSPOT_ENTITY_KEY,
    });
    expect(result.transactionData.transactions.length).to.be.greaterThan(0);
    const sigs = await signAndSubmitTransactionData(
      connection,
      result.transactionData,
      payer
    );
    expect(sigs.length).to.equal(1);

    // Second burn of the same hotspot must fail to submit: the fork's merkle
    // tree changed, so the (mainnet-sourced) proof no longer validates. This
    // proves the first burn actually mutated on-chain state.
    const repeat = await client.hotspots.burnHotspot({
      walletAddress,
      hotspotPubkey: TEST_HOTSPOT_ENTITY_KEY,
    });
    let threw = false;
    try {
      await signAndSubmitTransactionData(
        connection,
        repeat.transactionData,
        payer
      );
    } catch {
      threw = true;
    }
    expect(threw, "expected a repeat burn to fail after the leaf was burned").to
      .be.true;
  });
});
