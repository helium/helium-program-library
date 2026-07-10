import { publicProcedure } from "../../../procedures";
import { PublicKey } from "@solana/web3.js";
import { env } from "@/lib/env";
import { createSolanaConnection } from "@/lib/solana";
import { latLngToH3 } from "@/lib/location/h3";
import {
  init,
  iotInfoKey,
  mobileInfoKey,
  keyToAssetKey,
  rewardableEntityConfigKey,
} from "@helium/helium-entity-manager-sdk";
import { daoKey, subDaoKey } from "@helium/helium-sub-daos-sdk";
import {
  HNT_MINT,
  IOT_MINT,
  MOBILE_MINT,
  proofArgsAndAccounts,
} from "@helium/spl-utils";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import {
  calculateRequiredBalance,
  getTransactionFee,
} from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { getAssetIdFromPubkey } from "@/lib/utils/hotspot-helpers";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";

/**
 * Onboard a previously-issued data-only hotspot into a sub-DAO, asserting its
 * location (and, for IoT, gain/elevation). Data-only onboarding is permissionless:
 * we build the OnboardDataOnly{Iot,Mobile}HotspotV0 instruction locally with the
 * hotspot's compressed-NFT merkle proof, and the wallet (the sole signer, payer,
 * and DC fee payer) signs and submits. No onboarding server or maker is involved.
 */
export const onboardDataOnlyHotspot =
  publicProcedure.hotspots.onboardDataOnlyHotspot.handler(
    async ({ input, errors }) => {
      const {
        walletAddress,
        network,
        hotspotAddress,
        lat,
        lng,
        elevation,
        gain,
      } = input;
      const owner = new PublicKey(walletAddress);
      const { connection, provider } = createSolanaConnection(walletAddress);

      // The hotspot must already be issued (its cNFT must exist) before it can
      // be onboarded.
      const assetId = await getAssetIdFromPubkey(hotspotAddress);
      if (!assetId) {
        throw errors.NOT_FOUND({
          message: "Hotspot not found on-chain; issue it before onboarding",
        });
      }

      const program = await init(provider);
      const dao = daoKey(HNT_MINT)[0];
      const keyToAsset = keyToAssetKey(dao, hotspotAddress)[0];

      const assetEndpoint = env.ASSET_ENDPOINT || connection.rpcEndpoint;
      const { args, accounts, remainingAccounts } = await proofArgsAndAccounts({
        connection,
        assetId: new PublicKey(assetId),
        assetEndpoint,
      });

      // Assert a location only when both coordinates are given; the on-chain
      // location is the H3 cell index as a u64.
      const h3 =
        lat !== undefined && lng !== undefined
          ? latLngToH3({ lat, lng })
          : null;

      let onboardIx;
      if (network === "iot") {
        const subDao = subDaoKey(IOT_MINT)[0];
        const rewardableEntityConfig = rewardableEntityConfigKey(
          subDao,
          "IOT",
        )[0];
        onboardIx = await program.methods
          .onboardDataOnlyIotHotspotV0({
            ...args,
            location: h3 ? new BN(h3.iot, "hex") : null,
            // On-chain gain is tenths of a dBi (i32); elevation is whole meters.
            elevation: elevation !== undefined ? Math.trunc(elevation) : null,
            gain: gain !== undefined ? Math.trunc(gain * 10) : null,
          })
          .accountsPartial({
            payer: owner,
            dcFeePayer: owner,
            hotspotOwner: owner,
            rewardableEntityConfig,
            keyToAsset,
            iotInfo: iotInfoKey(rewardableEntityConfig, hotspotAddress)[0],
            subDao,
            merkleTree: accounts.merkleTree,
          })
          .remainingAccounts(remainingAccounts)
          .instruction();
      } else {
        const subDao = subDaoKey(MOBILE_MINT)[0];
        const rewardableEntityConfig = rewardableEntityConfigKey(
          subDao,
          "MOBILE",
        )[0];
        onboardIx = await program.methods
          .onboardDataOnlyMobileHotspotV0({
            ...args,
            location: h3 ? new BN(h3.mobile, "hex") : null,
          })
          .accountsPartial({
            payer: owner,
            dcFeePayer: owner,
            hotspotOwner: owner,
            rewardableEntityConfig,
            keyToAsset,
            mobileInfo: mobileInfoKey(
              rewardableEntityConfig,
              hotspotAddress,
            )[0],
            subDao,
            merkleTree: accounts.merkleTree,
          })
          .remainingAccounts(remainingAccounts)
          .instruction();
      }

      const tx = await buildVersionedTransaction({
        connection,
        draft: {
          instructions: [onboardIx],
          feePayer: owner,
          addressLookupTableAddresses: [],
        },
      });

      const totalFee = getTransactionFee(tx);
      const walletBalance = await connection.getBalance(owner);
      const required = calculateRequiredBalance(totalFee, 0);
      if (walletBalance < required) {
        throw errors.INSUFFICIENT_FUNDS({
          message: "Insufficient SOL balance for transaction fees",
          data: { required, available: walletBalance },
        });
      }

      return {
        transactionData: {
          transactions: [
            {
              serializedTransaction: serializeTransaction(tx),
              metadata: {
                type: "onboard_data_only_hotspot",
                description: "Onboard a data-only hotspot",
                network,
              },
            },
          ],
          parallel: false,
          tag: `onboard_data_only_hotspot:${walletAddress}:${hotspotAddress}`,
          actionMetadata: { type: "onboard_data_only_hotspot", network },
        },
        estimatedSolFee: await toTokenAmountOutput(
          new BN(totalFee),
          NATIVE_MINT.toBase58(),
        ),
      };
    },
  );
