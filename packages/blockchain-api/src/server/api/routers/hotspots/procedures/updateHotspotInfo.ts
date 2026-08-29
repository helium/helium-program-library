import { publicProcedure } from "../../../procedures";
import { env } from "@/lib/env";
import { createSolanaConnection } from "@/lib/solana";
import { assertAssetOwner } from "@/lib/utils/asset-ownership";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import {
  getAssetIdFromPubkey,
  initHemLocal,
} from "@/lib/utils/hotspot-helpers";
import { detectHotspotNetworks, getHotspotInfo } from "@/lib/queries/hotspots";
import animalName from "angry-purple-tiger";
import { latLngToH3 } from "@/lib/location/h3";
import OnboardingClient from "@helium/onboarding";
import { getAsset, proofArgsAndAccounts } from "@helium/spl-utils";
import {
  keyToAssetKey,
  decodeEntityKey,
} from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import { HNT_MINT } from "@helium/spl-utils";
import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";

import type { TransactionItem } from "@helium/blockchain-api/schemas/common";
import type { IdlTypes, Program } from "@coral-xyz/anchor";
import type { z } from "zod";
import { UpdateHotspotInfoInputSchema } from "@helium/blockchain-api/schemas/hotspots";
import {
  getTotalTransactionFees,
  getTransactionFee,
  calculateRequiredBalance,
  BASE_TX_FEE_LAMPORTS,
} from "@/lib/utils/balance-validation";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import {
  assertDcCovered,
  assertNotDelegated,
  buildOwnerPaidUpdateInstruction,
  dcBurnerFor,
  hotspotInfoKey,
  locationAssertDcFee,
  locationStakingFee,
  REWARDABLE_ENTITY_CONFIG,
  RESIZE_PADDING_BYTES,
  resizeTopUpLamports,
  toOnChainElevation,
  toOnChainGain,
  withPreservedWifiSerial,
} from "./update-info-owner";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import {
  getAccount,
  NATIVE_MINT,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from "@solana/spl-token";
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
  info: InputDeploymentInfo | undefined
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
  newInfo: InputDeploymentInfo | undefined
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
            : existingWifi.serial ?? null,
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

type HotspotInfo = Awaited<ReturnType<typeof getHotspotInfo>>;

/**
 * Lamports `resize_to_fit` moves from the payer into the mobile_info account.
 * The size is measured by serializing the account as the update will leave it
 * rather than modelling the layout, and the program only ever tops the account
 * up to the rent-exempt minimum, so an already-large-enough account costs
 * nothing.
 */
async function estimateMobileResizeRent({
  connection,
  program,
  infoKey,
  current,
  location,
  deploymentInfo,
}: {
  connection: Connection;
  program: HemProgram;
  infoKey: PublicKey;
  current: HotspotInfo["mobile"];
  location: BN | null;
  deploymentInfo: MobileDeploymentInfoV0 | undefined;
}): Promise<number> {
  const account = await connection.getAccountInfo(infoKey);
  if (!account || !current) return 0;

  const next = {
    ...current,
    ...(location ? { location } : {}),
    ...(deploymentInfo ? { deploymentInfo } : {}),
  };
  const encoded = await program.coder.accounts.encode(
    "mobileHotspotInfoV0",
    next
  );
  const rentExempt = await connection.getMinimumBalanceForRentExemption(
    encoded.length + RESIZE_PADDING_BYTES
  );
  return resizeTopUpLamports(rentExempt, account.lamports);
}

/** DC the owner holds, treating a missing token account as a zero balance. */
async function dcBalance(
  connection: Connection,
  owner: PublicKey
): Promise<bigint> {
  try {
    return (await getAccount(connection, dcBurnerFor(owner))).amount;
  } catch (e) {
    if (
      e instanceof TokenAccountNotFoundError ||
      e instanceof TokenInvalidAccountOwnerError
    ) {
      return BigInt(0);
    }
    throw e;
  }
}

/**
 * DC this update will burn on chain: the sub-DAO's location staking fee for
 * this hotspot, and only when the update actually moves the location. When the
 * sub-DAO's settings carry no fee for the hotspot, the burn is left to the
 * program to price rather than guessed at here.
 */
async function dcFeeForUpdate({
  program,
  network,
  info,
  newLocation,
}: {
  program: HemProgram;
  network: "iot" | "mobile";
  info: HotspotInfo;
  newLocation: BN | null;
}): Promise<BN> {
  const config = await (
    program.account as any
  ).rewardableEntityConfigV0.fetchNullable(REWARDABLE_ENTITY_CONFIG[network]);

  return locationAssertDcFee({
    newLocation,
    currentLocation: (network === "iot" ? info.iot : info.mobile)?.location,
    stakingFee: config
      ? locationStakingFee(
          config.settings,
          network === "iot"
            ? { network: "iot", isFullHotspot: !!info.iot?.isFullHotspot }
            : { network: "mobile", deviceType: info.mobile?.deviceType ?? {} }
        )
      : null,
  });
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

      assertAssetOwner({
        asset,
        expectedOwner: walletAddress,
        message: "Wallet does not own this hotspot",
        errors,
      });

      const hemProgram = await initHemLocal(provider);
      const [keyToAssetK] = keyToAssetKey(HNT_DAO, entityPubKey);
      const keyToAsset = await (hemProgram.account as any).keyToAssetV0.fetch(
        keyToAssetK
      );
      const entityKey = decodeEntityKey(
        keyToAsset.entityKey,
        keyToAsset.keySerialization
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
      const appliedTo = { iot: false, mobile: false };
      // Lamports the wallet pays on top of the transaction fee. Only owner mode
      // pays any: `resize_to_fit` funds a grown mobile_info account from
      // `payer`, which is the maker when the maker builds the transaction.
      let rentLamports = 0;
      let totalFee: number;

      if (input.feePayer === "owner") {
        const owner = new PublicKey(walletAddress);
        const network = input.deviceType;

        assertNotDelegated({
          owner: walletAddress,
          delegate: asset.ownership.delegate,
          errors,
        });

        const { args, accounts, remainingAccounts } =
          await proofArgsAndAccounts({
            connection,
            assetId: assetPubkey,
            assetEndpoint,
            // The asset is already in hand from the ownership check above;
            // reuse it rather than pay for a second DAS round-trip.
            getAssetFn: async () => asset,
          });

        const newLocation = h3
          ? new BN(network === "iot" ? h3.iot : h3.mobile, "hex")
          : null;
        const info = await getHotspotInfo(provider, entityKey);

        let updateIx;
        if (input.deviceType === "iot") {
          updateIx = await buildOwnerPaidUpdateInstruction({
            program: hemProgram,
            owner,
            entityKey,
            merkleTree: accounts.merkleTree,
            proofArgs: args,
            remainingAccounts,
            update: {
              network: "iot",
              location: newLocation,
              elevation: toOnChainElevation(input.elevation),
              gain: toOnChainGain(input.gain),
            },
          });
        } else {
          const mergedDeploymentInfo = mergeDeploymentInfo(
            info.mobile?.deploymentInfo ?? undefined,
            input.deploymentInfo
          );
          updateIx = await buildOwnerPaidUpdateInstruction({
            program: hemProgram,
            owner,
            entityKey,
            merkleTree: accounts.merkleTree,
            proofArgs: args,
            remainingAccounts,
            update: {
              network: "mobile",
              location: newLocation,
              deploymentInfo: mergedDeploymentInfo ?? null,
            },
          });
          rentLamports = await estimateMobileResizeRent({
            connection,
            program: hemProgram,
            infoKey: hotspotInfoKey("mobile", entityKey),
            current: info.mobile,
            location: newLocation,
            deploymentInfo: withPreservedWifiSerial(
              mergedDeploymentInfo,
              info.mobile?.deploymentInfo ?? undefined
            ),
          });
        }

        const dcFee = await dcFeeForUpdate({
          program: hemProgram,
          network,
          info,
          newLocation,
        });
        if (!dcFee.isZero()) {
          assertDcCovered({
            required: dcFee,
            available: await dcBalance(connection, owner),
            errors,
          });
        }

        const tx = await buildVersionedTransaction({
          connection,
          draft: { instructions: [updateIx], feePayer: owner },
        });
        totalFee = await getTransactionFee(connection, tx);
        transactions.push({
          serializedTransaction: serializeTransaction(tx),
          metadata: {
            type: "hotspot_update",
            description:
              network === "iot"
                ? "Update IoT hotspot info"
                : "Update Mobile hotspot info",
          },
        });
        appliedTo[network] = true;
      } else {
        const rawTxBytes: Uint8Array[] = [];
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
            input.deploymentInfo
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

        // Calculate fees from external transactions (format: v0 ensures VersionedTransaction)
        const vtxs = rawTxBytes.map((bytes) =>
          VersionedTransaction.deserialize(bytes)
        );
        totalFee = await getTotalTransactionFees(connection, vtxs);
      }

      const tag = generateTransactionTag({
        type: TRANSACTION_TYPES.HOTSPOT_UPDATE,
        walletAddress,
        entityPubKey,
      });

      // Check wallet has sufficient balance using actual transaction fees
      const walletBalance = await connection.getBalance(
        new PublicKey(walletAddress)
      );
      const required = calculateRequiredBalance(totalFee, rentLamports);
      if (walletBalance < required) {
        throw errors.INSUFFICIENT_FUNDS({
          message: "Insufficient SOL balance for transaction fees",
          data: { required, available: walletBalance },
        });
      }

      return {
        transactionData: {
          transactions,
          parallel: false,
          tag,
          actionMetadata: {
            type: "hotspot_update",
            hotspotKey: entityPubKey,
            hotspotName: entityKey ? animalName(entityKey) : undefined,
            deviceType: input.deviceType,
            ...(location && { location }),
            ...(h3 && { h3Index: h3.mobile ?? h3.iot }),
            ...(input.deviceType === "iot" &&
              input.gain !== undefined && { gain: input.gain }),
            ...(input.deviceType === "iot" &&
              input.elevation !== undefined && { elevation: input.elevation }),
            ...(input.deviceType === "mobile" &&
              input.deploymentInfo && {
                deploymentType: input.deploymentInfo.type,
                ...(input.deploymentInfo.type === "WIFI" && {
                  antenna: input.deploymentInfo.antenna,
                  elevation: input.deploymentInfo.elevation,
                  azimuth: input.deploymentInfo.azimuth,
                  mechanicalDownTilt: input.deploymentInfo.mechanicalDownTilt,
                  electricalDownTilt: input.deploymentInfo.electricalDownTilt,
                }),
                ...(input.deploymentInfo.type === "CBRS" && {
                  radioInfos: input.deploymentInfo.radioInfos,
                }),
              }),
          },
        },
        estimatedSolFee: await toTokenAmountOutput(
          new BN(totalFee + rentLamports),
          NATIVE_MINT.toBase58()
        ),
        appliedTo,
      };
    }
  );
