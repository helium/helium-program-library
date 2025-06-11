// @ts-ignore
import { BN, Program } from "@coral-xyz/anchor";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import {
  Asset,
  getAsset,
  searchAssets,
  SearchAssetsOpts,
  truthy,
} from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import { Op } from "sequelize";
import { Database, DeviceType, RewardableEntity } from "./database";
import { AssetOwner, KeyToAsset, Recipient, Reward, sequelize } from "./model";

const getRewardTypeForDevice = (deviceType: DeviceType): string =>
  `${deviceType.toString().toLowerCase()}_gateway`;
export class PgDatabase implements Database {
  constructor(
    readonly issuanceProgram: Program<HeliumEntityManager>,
    readonly lazyDistributorProgram: Program<LazyDistributor>,
    readonly lazyDistributor: PublicKey,
    readonly getAssetFn: (
      url: string,
      asset: PublicKey
    ) => Promise<Asset | undefined> = getAsset,
    readonly searchAssetsFn: (
      url: string,
      searchParams: SearchAssetsOpts
    ) => Promise<Asset[]> = searchAssets
  ) {}

  async getRewardableEntities(
    wallet: PublicKey,
    limit: number,
    batchNumber: number = 0
  ): Promise<{
    entities: RewardableEntity[];
    nextBatchNumber: number;
  }> {
    const offset = batchNumber * limit;
    const keyToAssets = await KeyToAsset.findAll({
      include: [
        {
          model: AssetOwner,
          required: true,
          where: { owner: wallet.toBase58() },
        },
        {
          model: Recipient,
          as: "Recipient",
          required: true,
          where: { lazyDistributor: this.lazyDistributor.toBase58() },
        },
      ],
      limit,
      offset,
    });

    const entityKeys = keyToAssets
      .map((kta) => kta.encodedEntityKey)
      .filter(truthy);
    const lifetimeRewards = await this.getBulkRewards(entityKeys);
    const entities: RewardableEntity[] = [];
    for (const kta of keyToAssets) {
      const recipient = kta.get("Recipient") as Recipient;
      const entityKey = kta.encodedEntityKey;
      if (!entityKey) continue;
      const lifetimeReward = lifetimeRewards[entityKey] || "0";
      const pendingRewards = new BN(lifetimeReward).sub(
        new BN(recipient?.totalRewards || "0")
      );
      if (!pendingRewards.lte(new BN("0"))) {
        entities.push({
          keyToAsset: new PublicKey(kta.address),
          lifetimeReward,
          pendingReward: pendingRewards.toString(),
          recipient: new PublicKey(recipient.address),
        });
      }
    }

    return {
      entities,
      nextBatchNumber: batchNumber + 1,
    };
  }

  async getTotalRewards(): Promise<string> {
    const totalRewards = (
      await Reward.findAll({
        attributes: [
          [sequelize.fn("SUM", sequelize.col("rewards")), "rewards"],
        ],
      })
    )[0].rewards;
    return totalRewards;
  }

  getActiveDevices(type?: DeviceType): Promise<number> {
    const rewardTypes = type
      ? [getRewardTypeForDevice(type)]
      : Object.values(DeviceType)
          .filter((value) => isNaN(Number(value))) // Filter out numeric enum keys
          .map((deviceType) =>
            getRewardTypeForDevice(deviceType as DeviceType)
          );

    return Reward.count({
      where: {
        lastReward: {
          [Op.gte]: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30), // Active within the last 30 days
        },
        rewardType: {
          [Op.in]: rewardTypes,
        },
      },
    });
  }

  async getBulkRewards(entityKeys: string[]): Promise<Record<string, string>> {
    const rewards = await Reward.findAll({
      where: {
        address: {
          [Op.in]: entityKeys,
        },
      },
    });

    return rewards
      .map((rew) => [rew.address, rew.rewards])
      .reduce((acc, [key, val]) => {
        acc[key] = new BN(val).toString();
        return acc;
      }, {} as Record<string, string>);
  }

  async getCurrentRewards(assetId: PublicKey) {
    const kta = await KeyToAsset.findOne({
      where: { asset: assetId.toBase58() },
    });

    if (!kta || !kta.encodedEntityKey) {
      console.error("No asset found", assetId.toBase58());
      return "0";
    }

    const rewards = await Reward.findByPk(kta.encodedEntityKey);

    if (!rewards) {
      throw new Error("Not a valid rewardable entity");
    }

    return this.getCurrentRewardsByEntity(kta.encodedEntityKey);
  }

  async getCurrentRewardsByEntity(entityKeyStr: string) {
    const reward = (await Reward.findByPk(entityKeyStr)) as Reward;

    return new BN(reward?.rewards).toString() || "0";
  }

  async getRewardsByOwner(owner: string) {
    try {
      const rewards = await Reward.findAll({
        include: [
          {
            model: KeyToAsset,
            required: true,
            attributes: [],
            include: [
              {
                model: Recipient,
                required: true,
                attributes: [],
                where: {
                  lazyDistributor: this.lazyDistributor.toBase58(),
                },
                include: [
                  {
                    model: AssetOwner,
                    required: true,
                    attributes: [],
                    where: { owner },
                  },
                ],
              },
            ],
          },
        ],
        attributes: [
          [sequelize.fn("SUM", sequelize.col("rewards")), "rewards"],
        ],
        raw: true,
      });

      const lifetime = rewards[0].rewards?.toString() || "0";
      const recipients = await Recipient.findAll({
        include: [
          {
            model: AssetOwner,
            required: true,
            attributes: [],
            where: { owner },
          },
        ],
        where: {
          lazyDistributor: this.lazyDistributor.toBase58(),
        },
        attributes: [
          [sequelize.fn("SUM", sequelize.col("total_rewards")), "totalRewards"],
        ],
        raw: true,
      });

      const claimed = recipients[0].totalRewards?.toString() || "0";
      const pending = new BN(lifetime).sub(new BN(claimed)).toString();

      return { lifetime, pending };
    } catch (err: any) {
      if (err?.parent?.code === "42P01") {
        console.warn("Table missing for getCurrentRewardsByOwner, returning 0");
        return { lifetime: "0", pending: "0" };
      }
      throw err;
    }
  }

  async getRewardsByDestination(destination: string) {
    try {
      const rewards = await Reward.findAll({
        include: [
          {
            model: KeyToAsset,
            required: true,
            attributes: [],
            include: [
              {
                model: Recipient,
                required: true,
                attributes: [],
                where: {
                  destination,
                  lazyDistributor: this.lazyDistributor.toBase58(),
                },
              },
            ],
          },
        ],
        attributes: [
          [sequelize.fn("SUM", sequelize.col("rewards")), "rewards"],
        ],
        raw: true,
      });

      const lifetime = rewards[0].rewards?.toString() || "0";
      const recipients = await Recipient.findAll({
        where: {
          destination,
          lazyDistributor: this.lazyDistributor.toBase58(),
        },
        attributes: [
          [sequelize.fn("SUM", sequelize.col("total_rewards")), "totalRewards"],
        ],
        raw: true,
      });

      const claimed = recipients[0].totalRewards?.toString() || "0";
      const pending = new BN(lifetime).sub(new BN(claimed)).toString();

      return { lifetime, pending };
    } catch (err: any) {
      if (err?.parent?.code === "42P01") {
        console.warn(
          "Table missing for getCurrentRewardsByDestination, returning 0"
        );
        return { lifetime: "0", pending: "0" };
      }
      throw err;
    }
  }
}
