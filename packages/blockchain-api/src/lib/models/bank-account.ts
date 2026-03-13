import {
  Model,
  DataTypes,
  InferCreationAttributes,
  InferAttributes,
} from "sequelize";
import { sequelize } from "../db";
import { BridgeUser } from "./bridge-user";

export class BankAccount extends Model<
  InferAttributes<BankAccount, { omit: never }>,
  InferCreationAttributes<BankAccount>
> {
  declare id?: number;
  declare bridgeUserId: number;
  declare bridgeExternalAccountId: string;
  declare accountName: string;
  declare bankName: string;
  declare lastFourDigits: string;
  declare routingNumber: string;
  declare accountType: string;

  declare bridgeUser?: BridgeUser;
}

BankAccount.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    bridgeUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: BridgeUser,
        key: "id",
      },
    },
    bridgeExternalAccountId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    accountName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    bankName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastFourDigits: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    routingNumber: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    accountType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "bank_accounts",
    underscored: true,
    timestamps: true,
  },
);
