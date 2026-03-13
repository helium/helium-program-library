import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db";

export class MiniFanout extends Model<
  InferAttributes<MiniFanout, { omit: never }>,
  InferCreationAttributes<MiniFanout>
> {
  declare address: string;
  declare owner: string;
  declare namespace: string;
  declare mint: string;
  declare tokenAccount: string;
  declare taskQueue: string;
  declare nextTask: string;
  declare rentRefund: string;
  declare bump: number;
  declare schedule: string;
  declare queueAuthorityBump: number;
  declare shares: MiniFanoutShareV0[];
  declare seed: Buffer;
  declare nextPreTask: string;
}

export interface MiniFanoutShareV0 {
  wallet: string;
  delegate: string;
  share: Share;
  totalDust: string;
  totalOwed: string;
}

export interface Share {
  share?: { amount: number };
  fixed?: { amount: string };
}

MiniFanout.init(
  {
    address: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    owner: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    namespace: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    mint: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    tokenAccount: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    taskQueue: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    nextTask: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    rentRefund: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    bump: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    schedule: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    queueAuthorityBump: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    shares: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    seed: {
      type: DataTypes.BLOB,
      allowNull: false,
    },
    nextPreTask: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "mini_fanouts",
    timestamps: false,
    underscored: true,
  },
);
