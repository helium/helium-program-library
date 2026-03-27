import { Model, DataTypes } from "sequelize";
import { sequelize } from "../db";
import PendingTransaction from "./pending-transaction";

export type BatchStatus =
  | "pending"
  | "confirmed"
  | "failed"
  | "expired"
  | "partial";
export type SubmissionType =
  | "single"
  | "parallel"
  | "sequential"
  | "jito_bundle";

export interface TransactionBatchAttributes {
  id: string;
  parallel: boolean;
  status: BatchStatus;
  submissionType: SubmissionType;
  jitoBundleId?: string;
  cluster: string;
  tag?: string;
  payer: string;
  actionType?: string;
  actionMetadata?: Record<string, unknown>;
  confirmedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  transactions?: PendingTransaction[];
}

class TransactionBatch extends Model implements TransactionBatchAttributes {
  declare id: string;
  declare parallel: boolean;
  declare status: BatchStatus;
  declare submissionType: SubmissionType;
  declare jitoBundleId?: string;
  declare cluster: string;
  declare tag?: string;
  declare payer: string;
  declare actionType?: string;
  declare actionMetadata?: Record<string, unknown>;
  declare confirmedAt?: Date;
  declare createdAt: Date;
  declare updatedAt: Date;
  declare transactions?: PendingTransaction[];
}

TransactionBatch.init(
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    parallel: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "pending",
    },
    submissionType: {
      type: DataTypes.ENUM("single", "parallel", "sequential", "jito_bundle"),
      allowNull: false,
      field: "submission_type",
    },
    jitoBundleId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "jito_bundle_id",
    },
    cluster: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    tag: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    payer: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    actionType: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "action_type",
    },
    actionMetadata: {
      type: DataTypes.JSON,
      allowNull: true,
      field: "action_metadata",
    },
    confirmedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "confirmed_at",
    },
  },
  {
    sequelize,
    modelName: "transaction_batches",
    underscored: true,
  },
);

export default TransactionBatch;
