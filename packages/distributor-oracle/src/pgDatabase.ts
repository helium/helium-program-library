// @ts-ignore
import { BN, Program } from "@coral-xyz/anchor";
import {
  decodeEntityKey,
  entityCreatorKey,
  keyToAssetForAsset,
} from "@helium/helium-entity-manager-sdk";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import {
  Asset,
  SearchAssetsOpts,
  getAsset,
  searchAssets,
} from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import { Op, QueryTypes } from "sequelize";
import { DAO } from "./constants";
import { Database, DeviceType, RewardableEntity } from "./database";
import { Reward, sequelize } from "./model";

const ENTITY_CREATOR = entityCreatorKey(DAO)[0];

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
    const results = await sequelize.query<{
      kta_address: string;
      entity_key: string;
      asset: string;
      lifetime: string;
      claimed: string;
      recipient_address: string | null;
    }>(
      `
        SELECT
          kta.address AS kta_address,
          kta.encoded_entity_key AS entity_key,
          kta.asset AS asset,
          COALESCE(r.rewards, '0') AS lifetime,
          COALESCE(rec.total_rewards, '0') AS claimed,
          rec.address AS recipient_address
        FROM asset_owners ao
        JOIN key_to_assets kta ON ao.asset = kta.asset
        LEFT JOIN reward_index r ON kta.encoded_entity_key = r.address
        LEFT JOIN recipients rec
          ON kta.asset = rec.asset
          AND rec.lazy_distributor = :lazyDistributor
        WHERE ao.owner = :owner
        LIMIT :limit OFFSET :offset
      `,
      {
        replacements: {
          owner: wallet.toBase58(),
          lazyDistributor: this.lazyDistributor.toBase58(),
          limit,
          offset,
        },
        type: QueryTypes.SELECT,
      }
    );

    const entities: RewardableEntity[] = [];
    for (const row of results) {
      const lifetimeReward = row.lifetime ?? "0";
      const claimed = row.claimed ?? "0";
      const pendingRewards = new BN(lifetimeReward).sub(new BN(claimed));
      if (!pendingRewards.lte(new BN("0"))) {
        entities.push({
          keyToAsset: new PublicKey(row.kta_address),
          lifetimeReward,
          pendingReward: pendingRewards.toString(),
          recipient: row.recipient_address
            ? new PublicKey(row.recipient_address)
            : new PublicKey(row.asset),
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
    const asset = await this.getAssetFn(
      process.env.ASSET_API_URL ||
        this.issuanceProgram.provider.connection.rpcEndpoint,
      assetId
    );
    if (!asset) {
      console.error("No asset found", assetId.toBase58());
      return "0";
    }
    const keyToAssetKey = keyToAssetForAsset(asset, DAO);
    const keyToAsset = await this.issuanceProgram.account.keyToAssetV0.fetch(
      keyToAssetKey
    );
    const entityKey = decodeEntityKey(
      keyToAsset.entityKey,
      keyToAsset.keySerialization
    )!;
    // Verify the creator is our entity creator, otherwise they could just
    // pass in any NFT with this ecc compact to collect rewards
    if (
      !asset.creators[0].verified ||
      !new PublicKey(asset.creators[0].address).equals(ENTITY_CREATOR)
    ) {
      throw new Error("Not a valid rewardable entity");
    }

    return this.getCurrentRewardsByEntity(entityKey);
  }

  async getCurrentRewardsByEntity(entityKeyStr: string) {
    const reward = (await Reward.findByPk(entityKeyStr)) as Reward;

    return new BN(reward?.rewards).toString() || "0";
  }

  async getRewardsByOwner(owner: string) {
    try {
      const [result] = await sequelize.query<{
        lifetime: string;
        claimed: string;
      }>(
        `
          SELECT
            COALESCE((
              SELECT SUM(r.rewards)
              FROM reward_index r
              JOIN key_to_assets kta ON r.address = kta.encoded_entity_key
              JOIN asset_owners ao ON kta.asset = ao.asset
              WHERE ao.owner = :owner
            ), 0) AS lifetime,
            COALESCE((
              SELECT SUM(rec.total_rewards)
              FROM recipients rec
              JOIN asset_owners ao2 ON rec.asset = ao2.asset
              WHERE ao2.owner = :owner
                AND rec.lazy_distributor = :lazyDistributor
          ), 0) AS claimed
        `,
        {
          replacements: {
            owner,
            lazyDistributor: this.lazyDistributor.toBase58(),
          },
          type: QueryTypes.SELECT,
        }
      );

      const lifetime = result.lifetime ?? "0";
      const claimed = result.claimed ?? "0";
      const pending = new BN(lifetime).sub(new BN(claimed)).toString();
      return { lifetime: claimed, pending };
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
      const [result] = await sequelize.query<{
        lifetime: string;
        claimed: string;
      }>(
        `
          SELECT
            COALESCE((
              SELECT SUM(r.rewards)
              FROM reward_index r
              JOIN key_to_assets kta ON r.address = kta.encoded_entity_key
              JOIN recipients rec ON kta.asset = rec.asset
              WHERE rec.destination = :destination
                AND rec.lazy_distributor = :lazyDistributor
            ), 0) AS lifetime,
            COALESCE((
              SELECT SUM(rec2.total_rewards)
              FROM recipients rec2
              WHERE rec2.destination = :destination
                AND rec2.lazy_distributor = :lazyDistributor
            ), 0) AS claimed
        `,
        {
          replacements: {
            destination,
            lazyDistributor: this.lazyDistributor.toBase58(),
          },
          type: QueryTypes.SELECT,
        }
      );

      const lifetime = result.lifetime ?? "0";
      const claimed = result.claimed ?? "0";
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
