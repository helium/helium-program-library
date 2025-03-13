import * as anchor from "@coral-xyz/anchor";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import { PublicKey } from "@solana/web3.js";

export enum DeviceType {
  IOT = "iot",
  MOBILE = "mobile",
}

export interface Database {
  getTotalRewards(): Promise<string>;
  getCurrentRewardsByEntity: (entityKey: string) => Promise<string>;
  getCurrentRewards: (asset: PublicKey) => Promise<string>;
  getBulkRewards: (entityKeys: string[]) => Promise<Record<string, string>>;
  getActiveDevices(type?: DeviceType): Promise<number>;
  getRewardableEntities(
    wallet: PublicKey,
    limit: number,
    batchNumber?: number
  ): Promise<{
    entities: RewardableEntity[]
    nextBatchNumber: number
  }>;
}

export type KeyToAssetV0 = anchor.IdlAccounts<HeliumEntityManager>["keyToAssetV0"] & {
  address: PublicKey;
};
export type RecipientV0 =
  anchor.IdlAccounts<LazyDistributor>["recipientV0"] & {
    address: PublicKey;
  };
export type RewardableEntity = {
  keyToAsset: KeyToAssetV0;
  recipient: RecipientV0
  lifetimeReward: string;
  pendingReward: string;
};

