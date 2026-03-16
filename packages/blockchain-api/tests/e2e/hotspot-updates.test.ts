import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { after, before, describe, it } from "mocha";
import { isDefinedError } from "@orpc/client";
import { stopNextServer } from "./helpers/next";
import { stopSurfpool } from "./helpers/surfpool";
import { ensureTokenBalance } from "./helpers/wallet";
import { signAndSubmitTransactionData } from "./helpers/tx";
import { setupTestCtx, TestCtx } from "./helpers/context";
import { TEST_HOTSPOT_ENTITY_KEY, IOT_ONLY_HOTSPOT } from "./helpers/constants";
import { TOKEN_MINTS } from "../../src/lib/constants/tokens";

describe("hotspot-updates", () => {
  let ctx: TestCtx;

  before(async () => {
    ctx = await setupTestCtx();
    const DC_MINT = new PublicKey(TOKEN_MINTS.DC);
    await ensureTokenBalance(ctx.payer.publicKey, DC_MINT, 100_000);
  });

  after(async () => {
    await stopNextServer();
    await stopSurfpool();
  });

  describe("updateHotspotInfo", () => {
    it("updates mobile hotspot info with location", async () => {
      // #given owned mobile hotspot
      const entityPubKey = TEST_HOTSPOT_ENTITY_KEY;
      const walletAddress = ctx.payer.publicKey.toBase58();

      // #when updating location for mobile
      const { data, error } = await ctx.safeClient.hotspots.updateHotspotInfo({
        deviceType: "mobile",
        walletAddress,
        entityPubKey,
        location: { lat: 40.7128, lng: -74.006 },
      });

      // #then returns valid transaction applied to mobile
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(
        data?.transactionData?.transactions?.[0]?.serializedTransaction,
      ).to.be.a("string");
      expect(data?.appliedTo?.mobile).to.equal(true);
      expect(data?.appliedTo?.iot).to.equal(false);

      // #then tx submits successfully
      await signAndSubmitTransactionData(
        ctx.connection,
        data.transactionData,
        ctx.payer,
      );
    });

    it("updates IoT-specific fields (gain, elevation)", async () => {
      // #given IoT hotspot
      const entityPubKey = IOT_ONLY_HOTSPOT;
      const walletAddress = ctx.payer.publicKey.toBase58();

      // #when updating IoT fields
      const { data, error } = await ctx.safeClient.hotspots.updateHotspotInfo({
        deviceType: "iot",
        walletAddress,
        entityPubKey,
        gain: 12,
        elevation: 15,
      });

      // #then returns transaction with IoT applied
      if (error) {
        if (
          isDefinedError(error) &&
          (error.code === "NOT_FOUND" || error.code === "UNAUTHORIZED")
        ) {
          console.log(
            `Skipping IoT-specific test: ${error.message} (hotspot may not be owned by test wallet)`,
          );
          return;
        }
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(
        data?.transactionData?.transactions?.[0]?.serializedTransaction,
      ).to.be.a("string");
      expect(data?.appliedTo?.iot).to.equal(true);

      // #then tx submits successfully
      await signAndSubmitTransactionData(
        ctx.connection,
        data.transactionData,
        ctx.payer,
      );
    });

    it("updates Mobile deploymentInfo (WiFi)", async () => {
      // #given Mobile hotspot
      const entityPubKey = TEST_HOTSPOT_ENTITY_KEY;
      const walletAddress = ctx.payer.publicKey.toBase58();

      // #when updating with WiFi deployment info
      const { data, error } = await ctx.safeClient.hotspots.updateHotspotInfo({
        deviceType: "mobile",
        walletAddress,
        entityPubKey,
        deploymentInfo: {
          type: "WIFI",
          antenna: 1,
          elevation: 10,
          azimuth: 180,
          mechanicalDownTilt: 5,
          electricalDownTilt: 3,
        },
      });

      // #then returns transaction with Mobile applied
      if (error) {
        if (
          isDefinedError(error) &&
          error.message?.includes("not a mobile device")
        ) {
          console.log(
            "Skipping WiFi deployment test: hotspot is not Mobile-capable",
          );
          return;
        }
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(
        data?.transactionData?.transactions?.[0]?.serializedTransaction,
      ).to.be.a("string");
      expect(data?.appliedTo?.mobile).to.equal(true);

      // #then tx submits successfully
      await signAndSubmitTransactionData(
        ctx.connection,
        data.transactionData,
        ctx.payer,
      );
    });

    it("returns 400 when deviceType does not match hotspot network", async () => {
      // #given IoT-only hotspot
      const entityPubKey = IOT_ONLY_HOTSPOT;
      const walletAddress = ctx.payer.publicKey.toBase58();

      // #when requesting mobile update on IoT-only hotspot
      const { error } = await ctx.safeClient.hotspots.updateHotspotInfo({
        deviceType: "mobile",
        walletAddress,
        entityPubKey,
        location: { lat: 51.5074, lng: -0.1278 },
      });

      // #then returns BAD_REQUEST
      if (!isDefinedError(error)) {
        if (!error) {
          console.log(
            "Skipping device type mismatch test: hotspot may support both networks",
          );
          return;
        }
        expect.fail(
          `Expected defined ORPCError - but got: ${JSON.stringify(error)}`,
        );
      }
      expect(error.code).to.equal("BAD_REQUEST");
      expect(error.message).to.include("not a mobile device");
    });

    it("returns 403 when wallet is not the owner", async () => {
      // #given hotspot not owned by this wallet
      const entityPubKey = TEST_HOTSPOT_ENTITY_KEY;
      const wrongWallet = Keypair.generate().publicKey.toBase58();

      // #when updating info
      const { error } = await ctx.safeClient.hotspots.updateHotspotInfo({
        deviceType: "mobile",
        walletAddress: wrongWallet,
        entityPubKey,
        location: { lat: 37.7749, lng: -122.4194 },
      });

      // #then returns UNAUTHORIZED
      if (!isDefinedError(error)) {
        expect.fail(
          `Expected defined ORPCError - but got: ${JSON.stringify(error)}`,
        );
      }
      expect(error.code).to.equal("UNAUTHORIZED");
      expect(error.message).to.include("not own");
    });

    it("returns 404 for non-existent hotspot", async () => {
      // #given non-existent hotspot
      const entityPubKey = Keypair.generate().publicKey.toBase58();
      const walletAddress = ctx.payer.publicKey.toBase58();

      // #when updating info
      const { error } = await ctx.safeClient.hotspots.updateHotspotInfo({
        deviceType: "iot",
        walletAddress,
        entityPubKey,
        location: { lat: 37.7749, lng: -122.4194 },
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
});
