import { connectToDb } from "@/lib/utils/db";
import {
  HotspotOwnershipAttributes,
  IotHotspotInfo,
  MobileHotspotInfo,
} from "@/lib/models/hotspot";
import WelcomePack, { WelcomePackAttributes } from "@/lib/models/welcome-pack";
import { toHotspot } from "@/lib/queries/hotspots";
import { Hotspot } from "@/types/hotspot";
import KeyToAsset from "../models/key-to-asset";
import { PublicKey } from "@solana/web3.js";
import { decodeEntityKey } from "@helium/helium-entity-manager-sdk";

export interface WelcomePackWithHotspot extends WelcomePackAttributes {
  hotspot: Hotspot | null;
  loading?: boolean;
}

interface WelcomePackQueryResult extends WelcomePackAttributes {
  iotHotspotInfo?: IotHotspotInfo | null;
  mobileHotspotInfo?: MobileHotspotInfo | null;
}

const welcomePackIncludes = [
  {
    model: IotHotspotInfo,
    as: "iotHotspotInfo",
    required: false,
    include: [
      {
        model: KeyToAsset,
        as: "keyToAsset",
        attributes: ["entityKey", "keySerialization"],
        required: false,
      },
    ],
  },
  {
    model: MobileHotspotInfo,
    as: "mobileHotspotInfo",
    required: false,
    include: [
      {
        model: KeyToAsset,
        as: "keyToAsset",
        attributes: ["entityKey", "keySerialization"],
        required: false,
      },
    ],
  },
];

function transformWelcomePackWithHotspot(
  pack: WelcomePack,
): WelcomePackWithHotspot {
  const packJson = pack.toJSON() as WelcomePackQueryResult;
  const infoStruct = packJson.iotHotspotInfo || packJson.mobileHotspotInfo;

  // Get raw rewardsSplit data from the database (before getter transformation)
  const rawRewardsSplit =
    (pack as any).getDataValue?.("rewardsSplit") ?? packJson.rewardsSplit;

  // Transform rewardsSplit to match the expected schema format
  const transformedRewardsSplit = (rawRewardsSplit ?? []).map((split: any) => {
    // Handle nested share structure: share.share.amount -> amount
    const amount = split.share?.share?.amount ?? split.amount ?? 0;
    // Handle wallet -> address mapping
    const address = split.wallet ?? split.address ?? "";

    return {
      address,
      type: split.type || "percentage",
      amount: typeof amount === "number" ? amount : Number(amount) || 0,
    };
  });

  if (!infoStruct) {
    const { iotHotspotInfo, mobileHotspotInfo, rewardsSplit, ...rest } =
      packJson;
    return {
      ...rest,
      id: typeof rest.id === "string" ? Number(rest.id) : rest.id,
      rewardsSplit: transformedRewardsSplit,
      hotspot: null,
    };
  }
  const encodedEntityKey =
    infoStruct?.keyToAsset &&
    decodeEntityKey(infoStruct.keyToAsset.entityKey, {
      [infoStruct?.keyToAsset?.keySerialization]: {},
    });
  const hotspotData: HotspotOwnershipAttributes = {
    iotHotspotInfo: packJson.iotHotspotInfo || undefined,
    mobileHotspotInfo: packJson.mobileHotspotInfo || undefined,
    asset: pack.asset,
    fanoutOwner: PublicKey.default.toBase58(),
    assetOwner: pack.address,
    destination: pack.owner,
    entityKey: infoStruct!.keyToAsset!.entityKey.toString(),
    encodedEntityKey: encodedEntityKey!.toString(),
    keySerialization: infoStruct!.keyToAsset!.keySerialization || "",
    shares: transformedRewardsSplit.reduce(
      (acc: number, curr: { amount: number }) => acc + curr.amount,
      0,
    ),
    totalShares: transformedRewardsSplit.reduce(
      (acc: number, curr: { amount: number }) => acc + curr.amount,
      0,
    ),
    fixedAmount: undefined,
    type: "direct",
    destinationIsOwner: false,
  };

  const hotspot = toHotspot(hotspotData);

  const { iotHotspotInfo, mobileHotspotInfo, rewardsSplit, ...rest } = packJson;

  return {
    ...rest,
    id: typeof rest.id === "string" ? Number(rest.id) : rest.id,
    rewardsSplit: transformedRewardsSplit,
    hotspot,
  };
}

/**
 * Fetches all welcome packs from the database for a given owner.
 * This function is safe to be called from any server-side context (Pages, API Routes, etc.).
 * @param owner The public key of the owner.
 * @returns A promise that resolves to an array of welcome pack objects.
 */
export async function getWelcomePacksByOwner(owner: string) {
  await connectToDb();

  // Get welcome packs with both IoT and Mobile hotspots in a single query
  const packs = await WelcomePack.findAll({
    where: { owner },
    include: welcomePackIncludes,
  });

  // Transform the results to match the expected format
  return packs.map(transformWelcomePackWithHotspot);
}

/**
 * Fetches a single welcome pack from the database by its address.
 * This function is safe to be called from any server-side context (Pages, API Routes, etc.).
 * @param address The address of the welcome pack.
 * @returns A promise that resolves to a welcome pack object or null if not found.
 */
export async function getWelcomePackByAddress(
  address: string,
): Promise<WelcomePackWithHotspot | null> {
  await connectToDb();

  const pack = await WelcomePack.findOne({
    where: { address },
    include: welcomePackIncludes,
  });

  if (!pack) {
    return null;
  }

  return transformWelcomePackWithHotspot(pack);
}
