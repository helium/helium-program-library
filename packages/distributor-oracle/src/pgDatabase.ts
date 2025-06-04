// @ts-ignore
import { BN, Program } from "@coral-xyz/anchor";
import {
  decodeEntityKey,
  entityCreatorKey,
  keyToAssetForAsset,
} from "@helium/helium-entity-manager-sdk";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import { recipientKey } from "@helium/lazy-distributor-sdk";
import {
  Asset,
  getAsset,
  searchAssets,
  SearchAssetsOpts,
} from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import { Op } from "sequelize";
import { DAO } from "./constants";
import {
  Database,
  DeviceType,
  KeyToAssetV0,
  RecipientV0,
  RewardableEntity,
} from "./database";
import {
  AssetOwner,
  KeyToAsset,
  Recipient,
  Reward,
  sequelize,
  WalletClaimJob,
} from "./model";

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

  private async getOrCreateWalletClaimJob(
    wallet: PublicKey,
    batchNumber?: number
  ) {
    if (!batchNumber) {
      await WalletClaimJob.destroy({
        where: { wallet: wallet.toBase58() },
      });
    }
    const job = await WalletClaimJob.findOne({
      where: { wallet: wallet.toBase58() },
    });
    if (!job) {
      let page = 1;
      const limit = 1000;
      let allKtas: string[] = [];

      while (true) {
        const assets =
          (await this.searchAssetsFn(
            process.env.ASSET_API_URL ||
              this.issuanceProgram.provider.connection.rpcEndpoint,
            {
              ownerAddress: wallet.toBase58(),
              creatorVerified: true,
              creatorAddress: ENTITY_CREATOR.toBase58(),
              page,
              limit,
            }
          )) || [];

        allKtas = allKtas.concat(
          assets.map((asset) => keyToAssetForAsset(asset, DAO).toBase58())
        );

        if (assets.length < limit) {
          break;
        }

        page++;
      }
      const job = await WalletClaimJob.create({
        wallet: wallet.toBase58(),
        remainingKtas: allKtas,
      });
      await job.save();
      return job;
    }
    return job;
  }

  async getRewardableEntities(
    wallet: PublicKey,
    limit: number,
    batchNumber: number = 0
  ): Promise<{
    entities: RewardableEntity[];
    nextBatchNumber: number;
  }> {
    const job = await this.getOrCreateWalletClaimJob(wallet, batchNumber);
    const entities: RewardableEntity[] = [];
    let nextBatchNumber = batchNumber || 0;
    while (entities.length == 0) {
      const remainingKtas = job.remainingKtas.slice(
        nextBatchNumber * limit,
        (nextBatchNumber + 1) * limit
      );
      if (remainingKtas.length === 0) {
        nextBatchNumber++;
        break;
      }
      const ktas = (
        await this.issuanceProgram.account.keyToAssetV0.fetchMultiple(
          remainingKtas
        )
      ).map((kta, index) => ({
        ...(kta as KeyToAssetV0),
        address: new PublicKey(remainingKtas[index]),
      }));
      const assets = ktas.map((kta) => kta.asset);
      const recipientKeys = assets.map(
        (a) => recipientKey(this.lazyDistributor, a)[0]
      );
      const recipients = (
        await this.lazyDistributorProgram.account.recipientV0.fetchMultiple(
          recipientKeys
        )
      ).map((r, index) => ({
        ...(r as RecipientV0),
        address: new PublicKey(recipientKeys[index]),
      }));
      const entityKeys = ktas.map(
        (kta) => decodeEntityKey(kta.entityKey, kta.keySerialization)!
      );
      const lifetimeRewards = await this.getBulkRewards(entityKeys);
      for (let i = 0; i < recipients.length; i++) {
        const entityKey = entityKeys[i];
        const recipient = recipients[i];
        const kta = ktas[i];
        const lifetimeReward = lifetimeRewards[entityKey];

        const pendingRewards = new BN(lifetimeReward).sub(
          recipient?.totalRewards || new BN("0")
        );
        if (!pendingRewards.lte(new BN("0"))) {
          entities.push({
            keyToAsset: kta,
            lifetimeReward: lifetimeReward,
            pendingReward: pendingRewards.toString(),
            recipient: recipient,
          });
        }
      }
      nextBatchNumber++;
    }

    return {
      entities,
      nextBatchNumber,
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

      console.log("recipients", recipients);
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
