import { Model, DataTypes, NonAttribute } from "sequelize";
import { sequelize } from "../db";
import { AssetOwner, IotHotspotInfo } from "./hotspot";
import { MobileHotspotInfo } from "./hotspot";
import { Recipient } from "./recipient";

export class KeyToAsset extends Model {
  declare address: string;
  declare asset: string;
  declare entityKey: Buffer;
  declare mobileHotspotInfo?: MobileHotspotInfo;
  declare iotHotspotInfo?: IotHotspotInfo;
  declare keySerialization: string;
  declare assetOwner?: NonAttribute<AssetOwner>;
  declare recipient?: NonAttribute<Recipient>;
}

KeyToAsset.init(
  {
    address: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    asset: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    entityKey: {
      type: DataTypes.BLOB,
      allowNull: false,
    },
    keySerialization: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "key_to_assets",
    underscored: true,
    timestamps: false,
  },
);

export default KeyToAsset;
