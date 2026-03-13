import {
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../db";

export class BridgeUser extends Model<
  InferAttributes<BridgeUser, { omit: never }>,
  InferCreationAttributes<BridgeUser>
> {
  declare id?: number;
  declare privyUserId: string;
  declare bridgeCustomerId: string | null;
  declare kycLinkId: string | null;
  declare kycStatus: string;
  declare tosStatus: string;
  declare tosLink: string | null;
  declare kycLink: string | null;
  declare accountType?: "individual" | "business";
}

BridgeUser.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    privyUserId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    bridgeCustomerId: {
      type: DataTypes.STRING,
      unique: true,
    },
    kycLinkId: {
      type: DataTypes.STRING,
      unique: true,
    },
    kycStatus: {
      type: DataTypes.STRING,
      defaultValue: "not_started",
    },
    tosStatus: {
      type: DataTypes.STRING,
      defaultValue: "pending",
    },
    tosLink: {
      type: DataTypes.TEXT,
    },
    kycLink: {
      type: DataTypes.TEXT,
    },
    accountType: {
      type: DataTypes.ENUM("individual", "business"),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "bridge_users",
    underscored: true,
    timestamps: true,
  },
);
