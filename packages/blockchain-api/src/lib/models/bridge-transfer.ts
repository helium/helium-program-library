import {
  Model,
  DataTypes,
  InferCreationAttributes,
  InferAttributes,
} from "sequelize";
import { sequelize } from "../db";
import { BankAccount } from "./bank-account";
import { BridgeUser } from "./bridge-user";

export class BridgeTransfer extends Model<
  InferAttributes<BridgeTransfer, { omit: never }>,
  InferCreationAttributes<BridgeTransfer>
> {
  declare id?: number;
  declare bridgeTransferId: string;
  declare bridgeUserId: number;
  declare bankAccountId: number;
  declare amount: string;
  declare state: string;
  declare solanaSignature?: string;
  declare createdAt?: Date;
  declare updatedAt?: Date;
}

BridgeTransfer.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    bridgeTransferId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    bridgeUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: BridgeUser,
        key: "id",
      },
    },
    bankAccountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: BankAccount,
        key: "id",
      },
    },
    amount: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    state: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    solanaSignature: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "bridge_transfers",
    underscored: true,
    timestamps: true,
  },
);
