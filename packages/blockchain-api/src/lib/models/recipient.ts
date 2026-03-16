import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from "sequelize";
import { sequelize } from "../db";
import KeyToAsset from "./key-to-asset";
import { MiniFanout } from "./mini-fanout";
import { AssetOwner } from "./hotspot";

export class Recipient extends Model<
  InferAttributes<Recipient, { omit: never }>,
  InferCreationAttributes<Recipient>
> {
  declare address: string;
  declare lazyDistributor: string;
  declare asset: string;
  declare totalRewards: string;
  declare currentConfigVersion: number;
  declare currentRewards: (string | null)[];
  declare bumpSeed: number;
  declare destination: string;
  declare split?: NonAttribute<MiniFanout>;
}

Recipient.init(
  {
    address: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    lazyDistributor: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    asset: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    totalRewards: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    currentConfigVersion: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    currentRewards: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
    },
    bumpSeed: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    destination: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "recipients",
    timestamps: false,
    underscored: true,
  },
);
