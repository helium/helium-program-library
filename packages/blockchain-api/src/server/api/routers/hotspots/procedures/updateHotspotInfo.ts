import { publicProcedure } from "../../../procedures";
import { env } from "@/lib/env";
import { createSolanaConnection } from "@/lib/solana";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import {
  getAssetIdFromPubkey,
  initHemLocal,
} from "@/lib/utils/hotspot-helpers";
import { detectHotspotNetworks, getHotspotInfo } from "@/lib/queries/hotspots";
import { latLngToH3 } from "@/lib/location/h3";
import OnboardingClient from "@helium/onboarding";
import { getAsset } from "@helium/spl-utils";
import {
  keyToAssetKey,
  decodeEntityKey,
} from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import { HNT_MINT } from "@helium/spl-utils";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";

import type { TransactionItem } from "@helium/blockchain-api/schemas/common";
import type { IdlTypes, Program } from "@coral-xyz/anchor";
import type { z } from "zod";
import { UpdateHotspotInfoInputSchema } from "@helium/blockchain-api/schemas/hotspots";
import {
  getTransactionFee,
  calculateRequiredBalance,
  BASE_TX_FEE_LAMPORTS,
} from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";

type HemProgram = Awaited<ReturnType<typeof initHemLocal>>;
type HemIdl = HemProgram extends Program<infer T> ? T : never;
type MobileDeploymentInfoV0 = IdlTypes<HemIdl>["mobileDeploymentInfoV0"];

const HNT_DAO = daoKey(HNT_MINT)[0];

// DeploymentInfo from input schema - fields can be undefined (serial can be null)
type UpdateHotspotInfoInput = z.infer<typeof UpdateHotspotInfoInputSchema>;
type InputDeploymentInfo = Extract<
  UpdateHotspotInfoInput,
  { deviceType: "mobile" }
>["deploymentInfo"];

// Convert input deploymentInfo to onboarding format (partial)
function inputToOnboardingDeploymentInfo(
  info: InputDeploymentInfo | undefined,
): MobileDeploymentInfoV0 | undefined {
  if (!info) return undefined;

  if (info.type === "WIFI") {
    const { type: _, ...wifi } = info;
    return { wifiInfoV0: wifi };
  }

  if (info.type === "CBRS") {
    const { type: _, ...cbrs } = info;
    return { cbrsInfoV0: cbrs };
  }

  return undefined;
}

// Merge existing onboarding deploymentInfo with new input deploymentInfo
// null = unset the field, undefined = use the prior value
function mergeDeploymentInfo(
  existing: MobileDeploymentInfoV0 | null | undefined,
  newInfo: InputDeploymentInfo | undefined,
): MobileDeploymentInfoV0 | undefined {
  if (!newInfo) return existing ?? undefined;
  if (!existing) return inputToOnboardingDeploymentInfo(newInfo);

  // Determine types
  const existingType = "wifiInfoV0" in existing ? "WIFI" : "CBRS";
  const newType = newInfo.type;

  // Type must match to merge
  if (existingType !== newType) {
    return inputToOnboardingDeploymentInfo(newInfo);
  }

  if (existingType === "WIFI" && newType === "WIFI" && existing.wifiInfoV0) {
    const existingWifi = existing.wifiInfoV0;
    const { type: _, serial, ...wifi } = newInfo;

    return {
      wifiInfoV0: {
        antenna:
          wifi.antenna !== undefined ? wifi.antenna : existingWifi.antenna,
        elevation:
          wifi.elevation !== undefined
            ? wifi.elevation
            : existingWifi.elevation,
        azimuth:
          wifi.azimuth !== undefined ? wifi.azimuth : existingWifi.azimuth,
        mechanicalDownTilt:
          wifi.mechanicalDownTilt !== undefined
            ? wifi.mechanicalDownTilt
            : existingWifi.mechanicalDownTilt,
        electricalDownTilt:
          wifi.electricalDownTilt !== undefined
            ? wifi.electricalDownTilt
            : existingWifi.electricalDownTilt,
        serial:
          serial !== undefined
            ? serial === null
              ? null
              : serial
            : (existingWifi.serial ?? null),
      },
    };
  }

  if (existingType === "CBRS" && newType === "CBRS" && existing.cbrsInfoV0) {
    const { type: _, ...cbrs } = newInfo;
    return {
      cbrsInfoV0:
        cbrs.radioInfos !== undefined
          ? cbrs.radioInfos
          : existing.cbrsInfoV0.radioInfos,
    };
  }

  return inputToOnboardingDeploymentInfo(newInfo);
}

export const updateHotspotInfo =
  publicProcedure.hotspots.updateHotspotInfo.handler(
    async ({ input, errors }) => {
      const { walletAddress, entityPubKey, location } = input;

      const assetId = await getAssetIdFromPubkey(entityPubKey);
      if (!assetId) {
        throw errors.NOT_FOUND({ message: "Hotspot not found" });
      }

      const { connection, provider } = createSolanaConnection(walletAddress);
      const assetEndpoint = env.ASSET_ENDPOINT || connection.rpcEndpoint;
      const assetPubkey = new PublicKey(assetId);

      const asset = await getAsset(assetEndpoint, assetPubkey);
      if (!asset) {
        throw errors.NOT_FOUND({ message: "Asset not found" });
      }

      const ownerAddress =
        typeof asset.ownership.owner === "string"
          ? asset.ownership.owner
          : asset.ownership.owner.toBase58();

      if (ownerAddress !== walletAddress) {
        throw errors.UNAUTHORIZED({
          message: "Wallet does not own this hotspot",
        });
      }

      // Check wallet has sufficient balance for transaction fees
      const walletBalance = await connection.getBalance(
        new PublicKey(walletAddress),
      );
      const required = calculateRequiredBalance(BASE_TX_FEE_LAMPORTS, 0);
      if (walletBalance < required) {
        throw errors.INSUFFICIENT_FUNDS({
          message: "Insufficient SOL balance for transaction fees",
          data: { required, available: walletBalance },
        });
      }

      const hemProgram = await initHemLocal(provider);
      const [keyToAssetK] = keyToAssetKey(HNT_DAO, entityPubKey);
      const keyToAsset = await (hemProgram.account as any).keyToAssetV0.fetch(
        keyToAssetK,
      );
      const entityKey = decodeEntityKey(
        keyToAsset.entityKey,
        keyToAsset.keySerialization,
      );

      if (!entityKey) {
        throw errors.NOT_FOUND({ message: "Could not decode entity key" });
      }

      const networks = await detectHotspotNetworks(provider, entityKey);

      if (input.deviceType === "iot" && !networks.iot) {
        throw errors.BAD_REQUEST({
          message: "Hotspot is not an IoT device",
        });
      }
      if (input.deviceType === "mobile" && !networks.mobile) {
        throw errors.BAD_REQUEST({
          message: "Hotspot is not a mobile device",
        });
      }

      const h3 = location ? latLngToH3(location) : null;
      const transactions: TransactionItem[] = [];
      const rawTxBytes: Uint8Array[] = [];
      const appliedTo = { iot: false, mobile: false };
      const onboardingClient = new OnboardingClient(env.ONBOARDING_ENDPOINT);

      if (input.deviceType === "iot") {
        const response = await onboardingClient.updateIotMetadata({
          hotspotAddress: entityPubKey,
          solanaAddress: walletAddress,
          location: h3?.iot,
          elevation: input.elevation,
          gain: input.gain,
          format: "v0",
        });
        const txs = response.data?.solanaTransactions ?? [];
        for (const txBytes of txs) {
          const bytes = Buffer.from(txBytes);
          rawTxBytes.push(bytes);
          transactions.push({
            serializedTransaction: Buffer.from(txBytes).toString("base64"),
            metadata: {
              type: "hotspot_update",
              description: "Update IoT hotspot info",
            },
          });
        }
        appliedTo.iot = true;
      } else {
        // Fetch existing mobile hotspot info to get current deploymentInfo
        const hotspotInfo = await getHotspotInfo(provider, entityKey);
        const existingDeploymentInfo =
          hotspotInfo.mobile?.deploymentInfo ?? undefined;

        // Merge existing with new deploymentInfo
        const mergedDeploymentInfo = mergeDeploymentInfo(
          existingDeploymentInfo,
          input.deploymentInfo,
        );

        const response = await onboardingClient.updateMobileMetadata({
          hotspotAddress: entityPubKey,
          solanaAddress: walletAddress,
          location: h3?.mobile,
          deploymentInfo: mergedDeploymentInfo,
          format: "v0",
        });
        const txs = response.data?.solanaTransactions ?? [];
        for (const txBytes of txs) {
          const bytes = Buffer.from(txBytes);
          rawTxBytes.push(bytes);
          transactions.push({
            serializedTransaction: Buffer.from(txBytes).toString("base64"),
            metadata: {
              type: "hotspot_update",
              description: "Update Mobile hotspot info",
            },
          });
        }
        appliedTo.mobile = true;
      }

      if (transactions.length === 0) {
        throw errors.NOT_FOUND({
          message:
            "Onboarding server returned no transactions for this hotspot",
        });
      }

      const tag = generateTransactionTag({
        type: TRANSACTION_TYPES.HOTSPOT_UPDATE,
        walletAddress,
        entityPubKey,
      });

      // Calculate fees from external transactions (format: v0 ensures VersionedTransaction)
      const totalFee = rawTxBytes.reduce((sum, bytes) => {
        const vtx = VersionedTransaction.deserialize(bytes);
        return sum + getTransactionFee(vtx);
      }, 0);

      return {
        transactionData: {
          transactions,
          parallel: false,
          tag,
          actionMetadata: { type: "hotspot_update", hotspotKey: entityPubKey, deviceType: input.deviceType },
        },
        estimatedSolFee: toTokenAmountOutput(
          new BN(totalFee),
          NATIVE_MINT.toBase58(),
        ),
        appliedTo,
      };
    },
  );
