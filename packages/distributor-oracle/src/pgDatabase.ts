// @ts-ignore
import { BN, Program } from "@coral-xyz/anchor";
import {
  decodeEntityKey,
  entityCreatorKey,
  keyToAssetForAsset,
} from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import {
  Asset,
  getAsset,
  HNT_MINT,
  searchAssets,
  SearchAssetsOpts,
  truthy,
} from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import { Op } from "sequelize";
import { Reward, sequelize, WalletClaimJob } from "./model";
import { DAO } from "./constants";
import {
  Database,
  DeviceType,
  KeyToAssetV0,
  RecipientV0,
  RewardableEntity,
} from "./database";
import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import { recipientKey, lazyDistributorKey } from "@helium/lazy-distributor-sdk";

const ENTITY_CREATOR = entityCreatorKey(DAO)[0];

const HNT_LAZY_DISTRIBUTOR = lazyDistributorKey(HNT_MINT)[0];

const getRewardTypeForDevice = (deviceType: DeviceType): string =>
  `${deviceType.toString().toLowerCase()}_gateway`;
export class PgDatabase implements Database {
  constructor(
    readonly issuanceProgram: Program<HeliumEntityManager>,
    readonly lazyDistributorProgram: Program<LazyDistributor>,
    readonly getAssetFn: (
      url: string,
      asset: PublicKey
    ) => Promise<Asset | undefined> = getAsset,
    readonly searchAssetsFn: (
      url: string,
      searchParams: SearchAssetsOpts
    ) => Promise<Asset[]> = searchAssets
  ) {}

  private async getOrCreateWalletClaimJob(wallet: PublicKey, isRequeue: boolean = false) {
    if (!isRequeue) {
      await WalletClaimJob.destroy({
        where: { wallet: wallet.toBase58() },
      })
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
      return new WalletClaimJob({
        wallet: wallet.toBase58(),
        remainingKtas: allKtas,
      });
    }
    return job;
  }

  async getRewardableEntities(
    wallet: PublicKey,
    limit: number,
    isRequeue: boolean = false
  ): Promise<RewardableEntity[]> {
    const job = await this.getOrCreateWalletClaimJob(wallet, isRequeue);
    const entities: RewardableEntity[] = [];
    while (entities.length < limit) {
      const remainingKtas = job.remainingKtas.slice(0, limit);
      if (remainingKtas.length === 0) {
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
        (a) => recipientKey(HNT_LAZY_DISTRIBUTOR, a)[0]
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
        if (pendingRewards.isZero()) {
          // No pending rewards, remove from job
          job.remainingKtas = job.remainingKtas.filter(
            (remainingKta) => remainingKta != kta.address.toBase58()
          );
        } else {
          entities.push({
            keyToAsset: kta,
            lifetimeReward: lifetimeReward,
            pendingReward: pendingRewards.toString(),
            recipient: recipient,
          });
        }
      }
    }

    job.set("remainingKtas", job.remainingKtas);
    await job.save();

    return entities;
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
}
