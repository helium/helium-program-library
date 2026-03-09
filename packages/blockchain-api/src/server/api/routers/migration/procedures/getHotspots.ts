import { publicProcedure } from "../../../procedures";
import { getHotspotsByOwner } from "@/lib/queries/hotspots";
import { getWelcomePacksByOwner } from "@/lib/queries/welcome-packs";
import { connectToDb } from "@/lib/utils/db";
import { AssetOwner } from "@/lib/models/hotspot";
import { Recipient } from "@/lib/models/recipient";
import { MiniFanout } from "@/lib/models/mini-fanout";
import { Op } from "sequelize";

/**
 * Get hotspots that can be migrated: directly owned + inside welcome packs.
 */
export const getHotspots = publicProcedure.migration.getHotspots.handler(
  async ({ input, errors }) => {
    const { walletAddress } = input;

    if (!walletAddress || walletAddress.length < 32) {
      throw errors.BAD_REQUEST({ message: "Invalid wallet address" });
    }

    // Fetch owned hotspots and welcome packs in parallel
    const [hotspotsData, welcomePacks] = await Promise.all([
      getHotspotsByOwner({ owner: walletAddress, page: 1, limit: 1000 }),
      getWelcomePacksByOwner(walletAddress),
    ]);

    // Directly owned hotspots
    const ownedHotspots = hotspotsData.hotspots
      .filter((h) => h.owner === walletAddress)
      .map((h) => ({ ...h, inWelcomePack: false }));

    // Welcome pack hotspots (deduplicate against owned)
    const ownedEntityKeys = new Set(ownedHotspots.map((h) => h.entityKey));
    const wpHotspots = welcomePacks
      .filter((wp) => wp.hotspot && !ownedEntityKeys.has(wp.hotspot.entityKey))
      .map((wp) => ({ ...wp.hotspot!, inWelcomePack: true }));

    const allHotspots = [...ownedHotspots, ...wpHotspots];

    // Look up split wallets for all hotspots via DB
    const assetIds = allHotspots.map((h) => h.asset).filter(Boolean);
    const splitWalletsByAsset = new Map<string, string[]>();

    if (assetIds.length > 0) {
      await connectToDb();
      const assetOwners = await AssetOwner.findAll({
        where: { asset: { [Op.in]: assetIds } },
        include: [
          {
            model: Recipient,
            as: "recipient",
            required: false,
            include: [{ model: MiniFanout, as: "split", required: false }],
          },
        ],
      });

      for (const ao of assetOwners) {
        if (ao.recipient?.split?.shares) {
          splitWalletsByAsset.set(
            ao.asset,
            ao.recipient.split.shares.map((s) => s.wallet),
          );
        }
      }
    }

    return {
      hotspots: allHotspots.map((h) => ({
        ...h,
        splitWallets: splitWalletsByAsset.get(h.asset) || undefined,
      })),
    };
  },
);
