import { Model, DataTypes } from "sequelize";
import { sequelize } from "../db";

export type TransactionStatus = "pending" | "confirmed" | "failed" | "expired";

export interface TransactionMetadata {
  type: string;
  description: string;
  [key: string]: any;
}

export interface PendingTransactionAttributes {
  id: number;
  signature: string;
  blockhash: string;
  lastValidBlockHeight?: number;
  status: TransactionStatus;
  type: string;
  batchId?: string;
  payer: string;
  metadata?: TransactionMetadata;
  serializedTransaction?: string;
  createdAt: Date;
  updatedAt: Date;
}

class PendingTransaction extends Model {
  declare id: number;
  declare signature: string;
  declare blockhash: string;
  declare lastValidBlockHeight?: number;
  declare status: TransactionStatus;
  declare type: string;
  declare batchId?: string;
  declare payer: string;
  declare metadata?: TransactionMetadata;
  declare serializedTransaction?: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

PendingTransaction.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    signature: DataTypes.STRING,
    blockhash: DataTypes.STRING,
    lastValidBlockHeight: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: "last_valid_block_height",
    },
    status: DataTypes.STRING,
    type: DataTypes.STRING,
    batchId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "batch_id",
    },

    payer: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    serializedTransaction: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "serialized_transaction",
    },
  },
  {
    sequelize,
    modelName: "pending_transactions",
    underscored: true,
  },
);

export default PendingTransaction;
