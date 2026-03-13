import { DeviceType } from "@/types/hotspot";
import {
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from "sequelize";
import { sequelize } from "../db";
import KeyToAsset from "./key-to-asset";
import { Recipient } from "./recipient";

export interface HotspotOwnershipAttributes {
  asset: string;
  fanoutOwner: string;
  assetOwner: string;
  destination: string;
  entityKey: string;
  encodedEntityKey: string;
  keySerialization: string;
  shares: number;
  totalShares: number;
  fixedAmount?: string;
  type: string;
  destinationIsOwner: boolean;
  iotHotspotInfo?: IotHotspotInfo;
  mobileHotspotInfo?: MobileHotspotInfo;
  recipient?: Recipient;
}

export class HotspotOwnership
  extends Model<
    HotspotOwnershipAttributes,
    Omit<
      HotspotOwnershipAttributes,
      "iotHotspotInfo" | "mobileHotspotInfo" | "recipient"
    >
  >
  implements HotspotOwnershipAttributes
{
  declare asset: string;
  declare fanoutOwner: string;
  declare assetOwner: string;
  declare destination: string;
  declare entityKey: string;
  declare encodedEntityKey: string;
  declare keySerialization: string;
  declare shares: number;
  declare totalShares: number;
  declare fixedAmount: string;
  declare type: string;
  declare destinationIsOwner: boolean;
  declare iotHotspotInfo?: NonAttribute<IotHotspotInfo>;
  declare mobileHotspotInfo?: NonAttribute<MobileHotspotInfo>;
  declare recipient?: NonAttribute<Recipient>;
}

HotspotOwnership.init(
  {
    asset: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    fanoutOwner: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    assetOwner: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    destination: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    entityKey: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    encodedEntityKey: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    keySerialization: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    shares: {
      type: DataTypes.DECIMAL,
      allowNull: false,
      primaryKey: true,
    },
    totalShares: {
      type: DataTypes.DECIMAL,
      allowNull: false,
    },
    fixedAmount: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    destinationIsOwner: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "hotspot_ownership_v0",
    timestamps: false,
    underscored: true,
  },
);

export class AssetOwner extends Model<
  InferAttributes<AssetOwner, { omit: never }>,
  InferCreationAttributes<AssetOwner>
> {
  declare asset: string;
  declare owner: string;
  declare iotHotspotInfo?: NonAttribute<IotHotspotInfo>;
  declare mobileHotspotInfo?: NonAttribute<MobileHotspotInfo>;
  declare recipient?: NonAttribute<Recipient>;
}

AssetOwner.init(
  {
    asset: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },
    owner: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "asset_owners",
    timestamps: true,
    underscored: true,
  },
);

export class IotHotspotInfo extends Model<
  InferAttributes<IotHotspotInfo>,
  InferCreationAttributes<IotHotspotInfo>
> {
  declare address: string;
  declare asset: string;
  declare city: string;
  declare state: string;
  declare country: string;
  declare keyToAsset?: NonAttribute<KeyToAsset>;
}

IotHotspotInfo.init(
  {
    address: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },
    asset: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    city: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    state: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    country: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "iot_hotspot_infos",
    timestamps: false,
    underscored: true,
  },
);

export class MobileHotspotInfo extends Model<
  InferAttributes<MobileHotspotInfo>,
  InferCreationAttributes<MobileHotspotInfo>
> {
  declare address: string;
  declare asset: string;
  declare city: string;
  declare state: string;
  declare country: string;
  declare deviceType: DeviceType;
  declare keyToAsset?: NonAttribute<KeyToAsset>;
}

MobileHotspotInfo.init(
  {
    address: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },
    asset: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    city: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    state: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    country: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    deviceType: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "mobile_hotspot_infos",
    timestamps: false,
    underscored: true,
  },
);
