import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { sleep } from "@helium/spl-utils";
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
import {
  ensureFunds,
  loadKeypair2FromEnv,
  loadKeypairFromEnv,
} from "./helpers/wallet";
import { signAndSubmitTransactionData } from "./helpers/tx";

const NETWORKS = ["mobile", "iot", "hnt"] as const;

// A real claim can't be synthesized (rewards are oracle-signed for a real,
// DAS-indexed hotspot), so this uses the real test wallets + ASSET_ENDPOINT.
// It discovers a hotspot that currently has claimable rewards rather than
// hardcoding one, since a fixed hotspot may already be drained on mainnet.
describe("single-hotspot claim rewards", () => {
  let wallets: Keypair[];
  let connection: Connection;
  let client: RouterClient<typeof appRouter>;

  before(async () => {
    if (!process.env.ASSET_ENDPOINT) {
      throw new Error("ASSET_ENDPOINT is required for the claim test");
    }
    applyMinimalServerEnv();
    await ensureSurfpool();
    await ensureNextServer();

    wallets = [loadKeypairFromEnv(), loadKeypair2FromEnv()];
    connection = new Connection(getSurfpoolRpcUrl(), "confirmed");
    for (const w of wallets) {
      await ensureFunds(w.publicKey, 0.05 * LAMPORTS_PER_SOL);
    }

    const link = new RPCLink({ url: "http://127.0.0.1:3000/rpc" });
    client = createORPCClient(link);
  });

  after(async () => {
    await stopNextServer();
    await stopSurfpool();
  });

  const claimableFor = async (
    walletAddress: string,
    network: (typeof NETWORKS)[number],
    entityPubKey: string
  ): Promise<bigint> => {
    const pending = await client.hotspots.getPendingRewards({
      walletAddress,
      network,
    });
    const hotspot = pending.byHotspot.find(
      (h) => h.hotspotPubKey === entityPubKey
    );
    return BigInt(hotspot?.pending.claimable.amount || "0");
  };

  it("claims the full pending rewards for one hotspot", async () => {
    // Find a (wallet, network, hotspot) that currently has claimable rewards.
    let target:
      | {
          payer: Keypair;
          network: (typeof NETWORKS)[number];
          entityPubKey: string;
        }
      | undefined;
    for (const payer of wallets) {
      const walletAddress = payer.publicKey.toBase58();
      for (const network of NETWORKS) {
        const pending = await client.hotspots.getPendingRewards({
          walletAddress,
          network,
        });
        const hotspot = pending.byHotspot.find(
          (h) => BigInt(h.pending.claimable.amount) > 0n
        );
        if (hotspot) {
          target = { payer, network, entityPubKey: hotspot.hotspotPubKey };
          break;
        }
      }
      if (target) break;
    }

    expect(
      target,
      "no test wallet has a hotspot with claimable rewards on the current fork"
    ).to.not.be.undefined;
    const { payer, network, entityPubKey } = target!;
    const walletAddress = payer.publicKey.toBase58();

    const before = await claimableFor(walletAddress, network, entityPubKey);
    expect(before).to.be.greaterThan(0n);

    const result = await client.hotspots.claimHotspotRewards({
      entityPubKey,
      walletAddress,
      network,
    });
    expect(result.transactionData.transactions.length).to.be.greaterThan(0);
    expect(
      result.transactionData.transactions[0].serializedTransaction
    ).to.be.a("string");

    await signAndSubmitTransactionData(
      connection,
      result.transactionData,
      payer
    );
    await sleep(2000);

    // After claiming, the hotspot's claimable rewards should have dropped.
    const remaining = await claimableFor(walletAddress, network, entityPubKey);
    expect(remaining).to.be.lessThan(before);
  });
});
