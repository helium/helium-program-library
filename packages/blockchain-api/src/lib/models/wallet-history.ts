import { Model, DataTypes } from "sequelize";
import { sequelize } from "../db";

export interface WalletHistoryAttributes {
  id: number;
  wallet: string;
  signature: string;
  actionType: string;
  actionMetadata?: Record<string, unknown>;
  slot: number;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

class WalletHistory extends Model implements WalletHistoryAttributes {
  declare id: number;
  declare wallet: string;
  declare signature: string;
  declare actionType: string;
  declare actionMetadata?: Record<string, unknown>;
  declare slot: number;
  declare timestamp: Date;
  declare createdAt: Date;
  declare updatedAt: Date;
}

WalletHistory.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    wallet: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    signature: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    actionType: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "action_type",
    },
    actionMetadata: {
      type: DataTypes.JSON,
      allowNull: true,
      field: "action_metadata",
    },
    slot: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "wallet_history",
    tableName: "wallet_history",
    underscored: true,
  },
);

export default WalletHistory;
