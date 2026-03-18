import { Model, DataTypes } from "sequelize";
import { sequelize } from "../db";

export interface WalletHistoryCursorAttributes {
  wallet: string;
  lastSignature: string;
  lastSlot: number;
  updatedAt: Date;
}

class WalletHistoryCursor
  extends Model
  implements WalletHistoryCursorAttributes
{
  declare wallet: string;
  declare lastSignature: string;
  declare lastSlot: number;
  declare updatedAt: Date;
}

WalletHistoryCursor.init(
  {
    wallet: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    lastSignature: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "last_signature",
    },
    lastSlot: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: "last_slot",
    },
  },
  {
    sequelize,
    modelName: "wallet_history_cursors",
    underscored: true,
    createdAt: false,
  },
);

export default WalletHistoryCursor;
