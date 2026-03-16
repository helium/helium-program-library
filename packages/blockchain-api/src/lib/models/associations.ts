import { BankAccount } from "./bank-account";
import { BridgeTransfer } from "./bridge-transfer";
import { BridgeUser } from "./bridge-user";
import {
  AssetOwner,
  HotspotOwnership,
  IotHotspotInfo,
  MobileHotspotInfo,
} from "./hotspot";
import { KeyToAsset } from "./key-to-asset";
import { MiniFanout } from "./mini-fanout";
import PendingTransaction from "./pending-transaction";
import { Recipient } from "./recipient";
import TransactionBatch from "./transaction-batch";
import WelcomePack from "./welcome-pack";

let associationsDefined = false;

export function defineAssociations() {
  // Only define associations once to avoid duplicate alias errors
  if (associationsDefined) {
    return;
  }
  associationsDefined = true;
  // Set up associations
  IotHotspotInfo.belongsTo(AssetOwner, {
    foreignKey: "asset",
    targetKey: "asset",
  });

  MobileHotspotInfo.belongsTo(AssetOwner, {
    foreignKey: "asset",
    targetKey: "asset",
  });

  AssetOwner.hasOne(IotHotspotInfo, {
    foreignKey: "asset",
    sourceKey: "asset",
    as: "iotHotspotInfo",
  });

  AssetOwner.hasOne(MobileHotspotInfo, {
    foreignKey: "asset",
    sourceKey: "asset",
    as: "mobileHotspotInfo",
  });

  HotspotOwnership.hasOne(IotHotspotInfo, {
    foreignKey: "asset",
    sourceKey: "asset",
    as: "iotHotspotInfo",
  });

  HotspotOwnership.hasOne(MobileHotspotInfo, {
    foreignKey: "asset",
    sourceKey: "asset",
    as: "mobileHotspotInfo",
  });

  HotspotOwnership.hasOne(Recipient, {
    foreignKey: "asset",
    sourceKey: "asset",
    as: "recipient",
  });
  HotspotOwnership.hasOne(AssetOwner, {
    foreignKey: "asset",
    sourceKey: "asset",
  });

  // Set up associations
  KeyToAsset.hasOne(IotHotspotInfo, {
    foreignKey: "asset",
    sourceKey: "asset",
    as: "iotHotspotInfo",
  });

  KeyToAsset.hasOne(MobileHotspotInfo, {
    foreignKey: "asset",
    sourceKey: "asset",
    as: "mobileHotspotInfo",
  });

  BankAccount.belongsTo(BridgeUser, {
    foreignKey: "bridgeUserId",
    as: "bridgeUser",
  });

  BridgeTransfer.belongsTo(BridgeUser, {
    foreignKey: "bridgeUserId",
    as: "bridgeUser",
  });

  BridgeTransfer.belongsTo(BankAccount, {
    foreignKey: "bankAccountId",
    as: "bankAccount",
  });

  MobileHotspotInfo.belongsTo(KeyToAsset, {
    foreignKey: "asset",
    targetKey: "asset",
    as: "keyToAsset",
  });

  IotHotspotInfo.belongsTo(KeyToAsset, {
    foreignKey: "asset",
    targetKey: "asset",
    as: "keyToAsset",
  });

  KeyToAsset.hasOne(AssetOwner, {
    foreignKey: "asset",
    sourceKey: "asset",
  });

  AssetOwner.belongsTo(KeyToAsset, {
    foreignKey: "asset",
    targetKey: "asset",
    as: "keyToAsset",
  });

  Recipient.belongsTo(KeyToAsset, {
    foreignKey: "asset",
    targetKey: "asset",
    as: "keyToAsset",
  });
  KeyToAsset.hasOne(Recipient, {
    foreignKey: "asset",
    sourceKey: "asset",
    as: "recipient",
  });
  MiniFanout.belongsTo(Recipient, {
    foreignKey: "address",
    targetKey: "destination",
    as: "split",
  });
  Recipient.hasOne(MiniFanout, {
    foreignKey: "address",
    sourceKey: "destination",
    as: "split",
  });
  AssetOwner.hasOne(Recipient, {
    foreignKey: "asset",
    sourceKey: "asset",
    as: "recipient",
  });

  WelcomePack.hasOne(IotHotspotInfo, {
    sourceKey: "asset",
    foreignKey: "asset",
    as: "iotHotspotInfo",
  });

  WelcomePack.hasOne(MobileHotspotInfo, {
    sourceKey: "asset",
    foreignKey: "asset",
    as: "mobileHotspotInfo",
  });

  // Transaction batch associations
  TransactionBatch.hasMany(PendingTransaction, {
    foreignKey: "batchId",
    as: "transactions",
  });

  PendingTransaction.belongsTo(TransactionBatch, {
    foreignKey: "batchId",
    as: "batch",
  });
}
