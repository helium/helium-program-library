import {
  HotspotOwnership,
  HotspotOwnershipAttributes,
  IotHotspotInfo,
  MobileHotspotInfo,
} from "@/lib/models/hotspot";
import { MiniFanout } from "@/lib/models/mini-fanout";
import { Recipient } from "@/lib/models/recipient";
import WelcomePackModel from "@/lib/models/welcome-pack";
import { connectToDb } from "@/lib/utils/db";
import { getAssetIdFromPubkey } from "@/lib/utils/hotspot-helpers";
import {
  DeviceType,
  Hotspot,
  HotspotsData,
  HotspotType,
} from "@/types/hotspot";
import {
  decodeEntityKey,
  entityCreatorKey,
  iotInfoKey,
  keyToAssetForAsset,
  keyToAssetKey,
  mobileInfoKey,
  rewardableEntityConfigKey,
} from "@helium/helium-entity-manager-sdk";
import { daoKey, subDaoKey } from "@helium/helium-sub-daos-sdk";
import { init as initLd, recipientKey } from "@helium/lazy-distributor-sdk";
import { init as initMiniFanout } from "@helium/mini-fanout-sdk";
import {
  HNT_MINT,
  IOT_MINT,
  MOBILE_MINT,
  searchAssetsWithPageInfo,
} from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import animalName from "angry-purple-tiger";
import { Op } from "sequelize";
import { HNT_LAZY_DISTRIBUTOR_ADDRESS } from "../constants/lazy-distributor";
import { env } from "../env";
import { createSolanaConnection } from "../solana";
import { initHemLocal } from "../utils/hotspot-helpers";

import type { AnchorProvider, IdlTypes, Program } from "@coral-xyz/anchor";

type HemProgram = Awaited<ReturnType<typeof initHemLocal>>;
type HemIdl = HemProgram extends Program<infer T> ? T : never;
type IotHotspotInfoV0 = IdlTypes<HemIdl>["iotHotspotInfoV0"];
type MobileHotspotInfoV0 = IdlTypes<HemIdl>["mobileHotspotInfoV0"];

export interface HotspotInfo {
  iot: IotHotspotInfoV0 | null;
  mobile: MobileHotspotInfoV0 | null;
}

export interface HotspotNetworks {
  iot: boolean;
  mobile: boolean;
}

const IOT_SUB_DAO_KEY = subDaoKey(IOT_MINT)[0];
const MOBILE_SUB_DAO_KEY = subDaoKey(MOBILE_MINT)[0];
export const IOT_CONFIG_KEY = rewardableEntityConfigKey(
  IOT_SUB_DAO_KEY,
  "IOT",
)[0];
export const MOBILE_CONFIG_KEY = rewardableEntityConfigKey(
  MOBILE_SUB_DAO_KEY,
  "MOBILE",
)[0];

interface GetHotspotsOptions {
  owner: string;
  type?: HotspotType;
  page?: number;
  limit?: number;
}

const HNT_DAO = daoKey(HNT_MINT)[0];
export function toHotspot(
  hotspotOwnership: HotspotOwnershipAttributes,
): Hotspot {
  const decodedAddress = hotspotOwnership.encodedEntityKey;

  const isMobile = !!hotspotOwnership.mobileHotspotInfo;
  const isIot = !!hotspotOwnership.iotHotspotInfo;
  const type = isIot && isMobile ? "all" : isIot ? "iot" : "mobile";

  const infoStruct = isIot
    ? hotspotOwnership.iotHotspotInfo
    : hotspotOwnership.mobileHotspotInfo;

  return {
    // @ts-ignore
    address: keyToAssetKey(
      HNT_DAO,
      typeof hotspotOwnership.entityKey === "string"
        ? Buffer.from(hotspotOwnership.entityKey, "utf-8")
        : hotspotOwnership.entityKey,
      hotspotOwnership.keySerialization as any,
    )[0].toBase58(),
    entityKey: decodedAddress ? decodedAddress : "",
    name: decodedAddress ? animalName(decodedAddress) : "",
    type,
    deviceType: isIot
      ? DeviceType.IotGateway
      : hotspotOwnership.mobileHotspotInfo?.deviceType || DeviceType.WifiIndoor,
    city: infoStruct?.city || undefined,
    state: infoStruct?.state || undefined,
    country: infoStruct?.country || undefined,
    asset: hotspotOwnership.asset,
    owner: hotspotOwnership.assetOwner,
    shares: {
      fixed: hotspotOwnership.fixedAmount,
      percentage:
        Number(hotspotOwnership.shares) === 0
          ? 0
          : Number(hotspotOwnership.shares) /
            Number(hotspotOwnership.totalShares),
    },
    ownershipType: hotspotOwnership.type,
  };
}

function toHotspotFromAsset(owner: string, asset: any): Hotspot {
  return {
    address: asset?.id,
    entityKey: asset?.entityKey || "",
    name: asset?.name || asset?.content?.metadata?.name || "",
    type: "all",
    deviceType: DeviceType.WifiIndoor,
    asset: asset?.id,
    ownershipType: "all",
  };
}

export async function getNumRecipientsNeeded(owner: string, lazyDistributorAddress: string = HNT_LAZY_DISTRIBUTOR_ADDRESS): Promise<number> {
  if (env.NO_PG === "true") {
    const allAssets = await searchAssetsWithPageInfo(env.ASSET_ENDPOINT!, {
      ownerAddress: owner,
      creatorVerified: true,
      creatorAddress: entityCreatorKey(daoKey(HNT_MINT)[0])[0].toBase58(),
      page: 1,
      limit: 1000,
      burnt: false,
      options: {
        showGrandTotal: true,
      },
    });
    // Build hotspot objects using DAS results with cached keyToAsset + hotspot info decoding
    const { provider } = createSolanaConnection(owner);
    const lazyProgram = await initLd(provider);

    const recipientKeys = allAssets.items.map(
      (asset) =>
        recipientKey(
          new PublicKey(lazyDistributorAddress),
          new PublicKey(asset.id),
        )[0],
    );
    const recipients =
      await lazyProgram.account.recipientV0.fetchMultiple(recipientKeys);
    return recipients.filter((r) => !r).length;
  } else {
    await connectToDb();
    // Count distinct assets owned by `owner` that do NOT have a recipient
    // for the given lazy distributor
    const count = await HotspotOwnership.count({
      distinct: true,
      col: "asset",
      where: {
        destination: owner,
        "$recipient.address$": { [Op.is]: null },
      },
      include: [
        {
          model: Recipient,
          as: "recipient",
          required: false,
          where: {
            lazyDistributor: lazyDistributorAddress,
          },
          attributes: [],
        },
      ],
    });
    return count;
  }
}

export async function getHotspotsByOwner({
  owner,
  type = "all",
  page = 1,
  limit = 10,
}: GetHotspotsOptions): Promise<HotspotsData> {
  if (env.NO_PG === "true") {
    const allAssets = await searchAssetsWithPageInfo(env.ASSET_ENDPOINT!, {
      ownerAddress: owner,
      creatorVerified: true,
      creatorAddress: entityCreatorKey(daoKey(HNT_MINT)[0])[0].toBase58(),
      page,
      limit,
      burnt: false,
      options: {
        showGrandTotal: true,
      },
    });
    // Build hotspot objects using DAS results with cached keyToAsset + hotspot info decoding
    const { provider } = createSolanaConnection(owner);
    const hemProgram = await initHemLocal(provider);

    // Fetch keyToAsset accounts in a single cached batch to ensure entityKey is decoded reliably
    const keyToAssetPubkeys = await Promise.all(
      allAssets.items.map((asset) => keyToAssetForAsset(asset)),
    );
    // @ts-ignore
    const keyToAssets = await hemProgram.account.keyToAssetV0.fetchMultiple(
      keyToAssetPubkeys.filter(Boolean) as PublicKey[],
    );

    // Decode entity keys using helper
    const entityKeys = keyToAssets.map((kta: any) =>
      kta?.entityKey
        ? decodeEntityKey(kta.entityKey, kta.keySerialization)
        : undefined,
    );

    // Prepare hotspot info keys from env-provided configs (optional)
    const iotInfoPubkeys = entityKeys.length
      ? entityKeys.map((ek) =>
          ek ? iotInfoKey(new PublicKey(IOT_CONFIG_KEY), ek)[0] : null,
        )
      : [];
    const mobileInfoPubkeys = entityKeys.length
      ? entityKeys.map((ek) =>
          ek ? mobileInfoKey(new PublicKey(MOBILE_CONFIG_KEY), ek)[0] : null,
        )
      : [];

    // Batch fetch hotspot info accounts via cache (decode via IDL)
    const iotInfos =
      iotInfoPubkeys.length > 0
        ? // @ts-ignore
          await hemProgram.account.iotHotspotInfoV0.fetchMultiple(
            iotInfoPubkeys.filter(Boolean) as PublicKey[],
          )
        : [];
    const mobileInfos =
      mobileInfoPubkeys.length > 0
        ? // @ts-ignore
          await hemProgram.account.mobileHotspotInfoV0.fetchMultiple(
            mobileInfoPubkeys.filter(Boolean) as PublicKey[],
          )
        : [];

    const hotspots: Hotspot[] = keyToAssets.map((kta: any, index: number) => {
      const assetAny: any = allAssets.items[index]!;
      const assetId: string = assetAny?.id?.toBase58();
      const entityKey = (entityKeys[index] as string) || "";

      const iotInfo: any =
        iotInfos.length > 0 && iotInfoPubkeys[index]
          ? iotInfos[
              (iotInfoPubkeys.filter(Boolean) as PublicKey[]).indexOf(
                iotInfoPubkeys[index] as PublicKey,
              )
            ]
          : undefined;
      const mobileInfo: any =
        mobileInfos.length > 0 && mobileInfoPubkeys[index]
          ? mobileInfos[
              (mobileInfoPubkeys.filter(Boolean) as PublicKey[]).indexOf(
                mobileInfoPubkeys[index] as PublicKey,
              )
            ]
          : undefined;

      const isIot = Boolean(iotInfo);
      const isMobile = Boolean(mobileInfo);
      const type: Hotspot["type"] =
        isIot && isMobile ? "all" : isIot ? "iot" : isMobile ? "mobile" : "all";

      const deviceType: Hotspot["deviceType"] = isIot
        ? DeviceType.IotGateway
        : (mobileInfo?.deviceType as DeviceType) || DeviceType.WifiIndoor;

      return {
        address: assetId,
        entityKey,
        name: entityKey ? animalName(entityKey) : "",
        type,
        deviceType,
        city:
          (iotInfo?.city as string) ||
          (mobileInfo?.city as string) ||
          undefined,
        state:
          (iotInfo?.state as string) ||
          (mobileInfo?.state as string) ||
          undefined,
        country:
          (iotInfo?.country as string) ||
          (mobileInfo?.country as string) ||
          undefined,
        asset: assetId,
        owner,
        shares: undefined,
        ownershipType: "all",
      };
    });

    return {
      hotspots,
      total: allAssets.grandTotal!,
      page,
      totalPages: Math.ceil(allAssets.grandTotal! / limit),
    };
  } else {
    await connectToDb();

    const offset = (page - 1) * limit;
    const { count: total, rows } = await HotspotOwnership.findAndCountAll({
      limit,
      offset,
      where: {
        destination: owner,
      },
      include: [
        {
          model: IotHotspotInfo,
          as: "iotHotspotInfo",
          required: type === "iot" || false,
        },
        {
          model: MobileHotspotInfo,
          as: "mobileHotspotInfo",
          required: type === "mobile" || false,
        },
      ],
    });
    const totalPages = Math.ceil(total / limit);
    const hotspots = rows.map(toHotspot);

    return {
      hotspots,
      total,
      page,
      totalPages,
    };
  }
}

export async function getHotspotInfo(
  provider: AnchorProvider,
  entityKey: string,
): Promise<HotspotInfo> {
  const hemProgram = await initHemLocal(provider);

  const [iotInfoK] = iotInfoKey(IOT_CONFIG_KEY, entityKey);
  const [mobileInfoK] = mobileInfoKey(MOBILE_CONFIG_KEY, entityKey);

  const [iotInfo, mobileInfo] = await Promise.all([
    hemProgram.account.iotHotspotInfoV0.fetchNullable(iotInfoK),
    hemProgram.account.mobileHotspotInfoV0.fetchNullable(mobileInfoK),
  ]);

  return { iot: iotInfo, mobile: mobileInfo };
}

export async function detectHotspotNetworks(
  provider: AnchorProvider,
  entityKey: string,
): Promise<HotspotNetworks> {
  if (env.NO_PG === "false") {
    await connectToDb();

    const [iotInfoK] = iotInfoKey(IOT_CONFIG_KEY, entityKey);
    const [mobileInfoK] = mobileInfoKey(MOBILE_CONFIG_KEY, entityKey);

    const [iotExists, mobileExists] = await Promise.all([
      IotHotspotInfo.findByPk(iotInfoK.toBase58()),
      MobileHotspotInfo.findByPk(mobileInfoK.toBase58()),
    ]);

    return { iot: !!iotExists, mobile: !!mobileExists };
  }

  const info = await getHotspotInfo(provider, entityKey);
  return { iot: info.iot !== null, mobile: info.mobile !== null };
}

export async function getHotspotInfoByAsset(
  provider: AnchorProvider,
  assetId: PublicKey,
): Promise<HotspotInfo & { entityKey: string }> {
  const hemProgram = await initHemLocal(provider);

  const keyToAsset =
    await hemProgram.account.keyToAssetV0.fetchNullable(assetId);

  if (!keyToAsset) {
    throw new Error("Asset not found in keyToAsset registry");
  }

  const entityKey = decodeEntityKey(
    keyToAsset.entityKey,
    keyToAsset.keySerialization,
  );

  if (!entityKey) {
    throw new Error("Could not decode entity key");
  }

  const info = await getHotspotInfo(provider, entityKey);

  return { ...info, entityKey };
}

export async function hasRewardContract(
  entityPubKey: string,
): Promise<boolean> {
  const assetId = await getAssetIdFromPubkey(entityPubKey);
  if (!assetId) return false;

  const assetPubkey = new PublicKey(assetId);

  if (env.NO_PG === "false") {
    await connectToDb();

    // PENDING: welcome pack exists
    const wpRecord = await WelcomePackModel.findOne({
      where: { asset: assetPubkey.toBase58() },
    });
    if (wpRecord) return true;

    // ACTIVE: recipient has mini fanout split
    const recipientRecord = await Recipient.findOne({
      where: { asset: assetPubkey.toBase58() },
      include: [{ model: MiniFanout, as: "split" }],
    });
    if (recipientRecord?.split) return true;
  }

  // On-chain fallback: check recipient destination points to valid mini fanout
  const { provider } = createSolanaConnection(PublicKey.default.toBase58());
  const ldProgram = await initLd(provider);
  const [recipientK] = recipientKey(
    new PublicKey(HNT_LAZY_DISTRIBUTOR_ADDRESS),
    assetPubkey,
  );
  const recipientAcc =
    await ldProgram.account.recipientV0.fetchNullable(recipientK);

  if (recipientAcc && !recipientAcc.destination.equals(PublicKey.default)) {
    const mfProgram = await initMiniFanout(provider);
    const miniFanout = recipientAcc.destination;

    // Verify the destination is actually a mini fanout account
    let miniFanoutAccount = null;
    try {
      miniFanoutAccount =
        await mfProgram.account.miniFanoutV0.fetchNullable(miniFanout);
    } catch {
      // Destination exists but is not a MiniFanout account - treat as no contract
    }

    if (miniFanoutAccount) {
      return true;
    }
  }

  return false;
}
