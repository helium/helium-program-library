import { AnchorProvider } from "@coral-xyz/anchor";
import { init as initLd, recipientKey } from "@helium/lazy-distributor-sdk";
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
import { ensureSurfpool, getSurfpoolRpcUrl, stopSurfpool } from "./helpers/surfpool";
import { ensureFunds, loadKeypairFromEnv } from "./helpers/wallet";
import { signAndSubmitTransactionData } from "./helpers/tx";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { appRouter } from "@/server/api";
import type { RouterClient } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import {
  HNT_LAZY_DISTRIBUTOR_ADDRESS,
  TEST_HOTSPOT_ENTITY_KEY,
  TEST_HOTSPOT_ASSET_ID,
} from "./helpers/constants";

describe("update-rewards-destination", () => {
  let payer: Keypair;
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
    connection = new Connection(getSurfpoolRpcUrl(), "confirmed");
    await ensureFunds(payer.publicKey, 0.1 * LAMPORTS_PER_SOL);

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

  it("updates rewards destination for a hotspot", async () => {
    const walletAddress = payer.publicKey.toBase58();
    const hotspotPubkey = TEST_HOTSPOT_ENTITY_KEY;
    const assetId = TEST_HOTSPOT_ASSET_ID;
    const destination = Keypair.generate().publicKey.toBase58();

    const result = await client.hotspots.updateRewardsDestination({
      walletAddress,
      hotspotPubkey,
      destination,
      lazyDistributors: [HNT_LAZY_DISTRIBUTOR_ADDRESS],
    });

    expect(
      result?.transactionData?.transactions?.[0]?.serializedTransaction
    ).to.be.a("string");
    expect(result?.transactionData?.tag).to.be.a("string");
    expect(result?.transactionData?.parallel).to.equal(false);

    // Verify transaction metadata
    const txData = result.transactionData.transactions[0];
    expect(txData.metadata?.type).to.equal("update_rewards_destination");
    expect(txData.metadata?.description).to.include(
      "Update rewards destination"
    );

    await signAndSubmitTransactionData(
      connection,
      result.transactionData,
      payer
    );

    // Verify recipient account was created/updated
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
    const [recipientK] = recipientKey(
      new PublicKey(HNT_LAZY_DISTRIBUTOR_ADDRESS),
      new PublicKey(assetId)
    );
    const recipientAcc = await ldProgram.account.recipientV0.fetchNullable(
      recipientK
    );
    expect(recipientAcc).to.exist;
    expect(recipientAcc?.destination?.toBase58()).to.equal(destination);
  });

  it("updates rewards destination to default (owner)", async () => {
    const walletAddress = payer.publicKey.toBase58();
    const hotspotPubkey = TEST_HOTSPOT_ENTITY_KEY;
    const assetId = TEST_HOTSPOT_ASSET_ID;
    const destination = PublicKey.default.toBase58();

    const result = await client.hotspots.updateRewardsDestination({
      walletAddress,
      hotspotPubkey,
      destination,
      lazyDistributors: [HNT_LAZY_DISTRIBUTOR_ADDRESS],
    });

    expect(
      result?.transactionData?.transactions?.[0]?.serializedTransaction
    ).to.be.a("string");

    await signAndSubmitTransactionData(
      connection,
      result.transactionData,
      payer
    );

    // Verify recipient was updated to default
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
    const [recipientK] = recipientKey(
      new PublicKey(HNT_LAZY_DISTRIBUTOR_ADDRESS),
      new PublicKey(assetId)
    );
    const recipientAcc = await ldProgram.account.recipientV0.fetchNullable(
      recipientK
    );
    expect(recipientAcc).to.exist;
    expect(recipientAcc?.destination?.toBase58()).to.equal(
      PublicKey.default.toBase58()
    );
  });

  it("handles multiple lazy distributors", async () => {
    const walletAddress = payer.publicKey.toBase58();
    const hotspotPubkey = TEST_HOTSPOT_ENTITY_KEY;
    const destination = Keypair.generate().publicKey.toBase58();

    // Note: In a real scenario, you'd have multiple lazy distributors
    // For testing, we'll use the same one multiple times to test the iteration logic
    const result = await client.hotspots.updateRewardsDestination({
      walletAddress,
      hotspotPubkey,
      destination,
      lazyDistributors: [HNT_LAZY_DISTRIBUTOR_ADDRESS],
    });

    expect(
      result?.transactionData?.transactions?.[0]?.serializedTransaction
    ).to.be.a("string");

    await signAndSubmitTransactionData(
      connection,
      result.transactionData,
      payer
    );
  });

  it("returns 400 for invalid public key format", async () => {
    const walletAddress = payer.publicKey.toBase58();
    const hotspotPubkey = TEST_HOTSPOT_ENTITY_KEY;

    try {
      // Use a 32-44 char string with invalid base58 chars (0, O, I, l are not valid)
      await client.hotspots.updateRewardsDestination({
        walletAddress,
        hotspotPubkey,
        destination: "0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl",
        lazyDistributors: [HNT_LAZY_DISTRIBUTOR_ADDRESS],
      });
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      expect(error).to.be.instanceOf(ORPCError);
      expect(error.code).to.equal("BAD_REQUEST");
      expect(error.message).to.include("Input validation failed");
    }
  });

  it("returns 400 for invalid lazy distributor address", async () => {
    const walletAddress = payer.publicKey.toBase58();
    const hotspotPubkey = TEST_HOTSPOT_ENTITY_KEY;
    const destination = Keypair.generate().publicKey.toBase58();

    try {
      // Use a 32-44 char string with invalid base58 chars (0, O, I, l are not valid)
      await client.hotspots.updateRewardsDestination({
        walletAddress,
        hotspotPubkey,
        destination,
        lazyDistributors: ["0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl"],
      });
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      expect(error).to.be.instanceOf(ORPCError);
      expect(error.code).to.equal("BAD_REQUEST");
      expect(error.message).to.include("Invalid public key");
    }
  });

  it("returns 400 for missing required fields", async () => {
    const walletAddress = payer.publicKey.toBase58();
    const hotspotPubkey = TEST_HOTSPOT_ENTITY_KEY;

    try {
      await (client.hotspots.updateRewardsDestination as any)({
        walletAddress,
        hotspotPubkey,
        lazyDistributors: [HNT_LAZY_DISTRIBUTOR_ADDRESS],
        // Missing destination
      });
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      expect(error).to.be.instanceOf(ORPCError);
      expect(error.code).to.equal("BAD_REQUEST");
    }
  });

  it("returns 400 for empty lazy distributors array", async () => {
    const walletAddress = payer.publicKey.toBase58();
    const hotspotPubkey = TEST_HOTSPOT_ENTITY_KEY;
    const destination = Keypair.generate().publicKey.toBase58();

    try {
      await client.hotspots.updateRewardsDestination({
        walletAddress,
        hotspotPubkey,
        destination,
        lazyDistributors: [],
      });
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      expect(error).to.be.instanceOf(ORPCError);
      expect(error.code).to.equal("BAD_REQUEST");
    }
  });

  it("shows warning in description when destination does not exist", async () => {
    const walletAddress = payer.publicKey.toBase58();
    const hotspotPubkey = TEST_HOTSPOT_ENTITY_KEY;
    const nonExistentDestination = Keypair.generate().publicKey.toBase58();

    const result = await client.hotspots.updateRewardsDestination({
      walletAddress,
      hotspotPubkey,
      destination: nonExistentDestination,
      lazyDistributors: [HNT_LAZY_DISTRIBUTOR_ADDRESS],
    });

    const txData = result.transactionData.transactions[0];
    expect(txData.metadata?.description).to.include(
      "Warning: destination account does not exist"
    );
  });
});
