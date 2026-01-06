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
import { KeyToAsset, Reward, WalletClaimJob, sequelize } from "./model";

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

  private async getOrCreateWalletClaimJobForOwner(
    wallet: PublicKey,
    batchNumber?: number
  ) {
    if (!batchNumber) {
      await WalletClaimJob.destroy({
        where: { wallet: wallet.toBase58() },
      });
    }
    let job = await WalletClaimJob.findOne({
      where: { wallet: wallet.toBase58() },
    });
    if (!job) {
      const results = await sequelize.query<{
        kta_address: string;
        lifetime: string;
        claimed: string;
      }>(
        `
          SELECT
            kta.address AS kta_address,
            COALESCE(r.rewards, '0') AS lifetime,
            COALESCE(rec.total_rewards, '0') AS claimed
          FROM asset_owners ao
          JOIN key_to_assets kta ON ao.asset = kta.asset
          LEFT JOIN reward_index r ON kta.encoded_entity_key = r.address
          LEFT JOIN recipients rec
            ON kta.asset = rec.asset
            AND rec.lazy_distributor = :lazyDistributor
          WHERE ao.owner = :wallet
        `,
        {
          replacements: {
            wallet: wallet.toBase58(),
            lazyDistributor: this.lazyDistributor.toBase58(),
          },
          type: QueryTypes.SELECT,
        }
      );
      const allKtas = results
        .filter((row) => {
          const lifetime = row.lifetime ?? "0";
          const claimed = row.claimed ?? "0";
          return new BN(lifetime).sub(new BN(claimed)).gt(new BN("0"));
        })
        .map((row) => row.kta_address);

      job = await WalletClaimJob.create({
        wallet: wallet.toBase58(),
        remainingKtas: allKtas,
      });
      await job.save();
    }
    return job;
  }

  private async getOrCreateWalletClaimJobForDestination(
    destination: PublicKey,
    batchNumber?: number
  ) {
    if (!batchNumber) {
      await WalletClaimJob.destroy({
        where: { wallet: destination.toBase58() },
      });
    }
    let job = await WalletClaimJob.findOne({
      where: { wallet: destination.toBase58() },
    });
    if (!job) {
      const results = await sequelize.query<{
        kta_address: string;
        lifetime: string;
        claimed: string;
      }>(
        `
          SELECT
            kta.address AS kta_address,
            COALESCE(r.rewards, '0') AS lifetime,
            COALESCE(rec.total_rewards, '0') AS claimed
          FROM key_to_assets kta
          JOIN reward_index r ON kta.encoded_entity_key = r.address
          JOIN recipients rec
            ON kta.asset = rec.asset
            AND rec.lazy_distributor = :lazyDistributor
          WHERE rec.destination = :wallet
        `,
        {
          replacements: {
            wallet: destination.toBase58(),
            lazyDistributor: this.lazyDistributor.toBase58(),
          },
          type: QueryTypes.SELECT,
        }
      );
      const allKtas = results
        .filter((row) => {
          const lifetime = row.lifetime ?? "0";
          const claimed = row.claimed ?? "0";
          return new BN(lifetime).sub(new BN(claimed)).gt(new BN("0"));
        })
        .map((row) => row.kta_address);

      job = await WalletClaimJob.create({
        wallet: destination.toBase58(),
        remainingKtas: allKtas,
      });
      await job.save();
    }
    return job;
  }

  async getRewardableEntities(
    wallet: PublicKey,
    limit: number,
    batchNumber: number = 0
  ): Promise<{
    entities: Pick<RewardableEntity, "keyToAsset">[];
    nextBatchNumber: number;
  }> {
    const job = await this.getOrCreateWalletClaimJobForOwner(
      wallet,
      batchNumber
    );
    let nextBatchNumber = batchNumber || 0;
    const remainingKtas = job.remainingKtas.slice(
      nextBatchNumber * limit,
      (nextBatchNumber + 1) * limit
    );

    const entities = remainingKtas.map((kta: string) => ({
      keyToAsset: new PublicKey(kta),
    }));

    nextBatchNumber++;

    return {
      entities,
      nextBatchNumber,
    };
  }

  async getRewardableEntitiesByDestination(
    destination: PublicKey,
    limit: number,
    batchNumber: number = 0
  ): Promise<{
    entities: Pick<RewardableEntity, "keyToAsset">[];
    nextBatchNumber: number;
  }> {
    const job = await this.getOrCreateWalletClaimJobForDestination(
      destination,
      batchNumber
    );
    let nextBatchNumber = batchNumber || 0;
    const remainingKtas = job.remainingKtas.slice(
      nextBatchNumber * limit,
      (nextBatchNumber + 1) * limit
    );

    const entities = remainingKtas.map((kta: string) => ({
      keyToAsset: new PublicKey(kta),
    }));

    nextBatchNumber++;

    return {
      entities,
      nextBatchNumber,
    };
  }

  async getTotalRewards(): Promise<string> {
    const totalRewards = (
      await Reward.findAll({
        include: [
          {
            model: KeyToAsset,
            required: true,
          },
        ],
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
        include: [
          {
            model: KeyToAsset,
            required: true,
          },
        ],
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
    const reward = (await Reward.findOne({
      where: {
        address: entityKeyStr,
      },
      include: [
        {
          model: KeyToAsset,
          required: true,
        },
      ],
    })) as Reward;

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
