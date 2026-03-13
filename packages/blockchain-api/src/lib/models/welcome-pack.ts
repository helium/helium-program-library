import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../db";
import { HNT_MINT } from "@helium/spl-utils";
import type { Hotspot } from "@helium/blockchain-api";

export type Recipient =
  | { address: string; type: "percentage"; amount: number }
  | {
      address: string;
      type: "fixed";
      tokenAmount: { amount: string; mint: string };
    };

class WelcomePack extends Model<
  InferAttributes<WelcomePack>,
  InferCreationAttributes<WelcomePack>
> {
  declare address: string;
  declare id: number;
  declare owner: string;
  declare asset: string;
  declare lazyDistributor: string;
  declare rewardsMint: string;
  declare rentRefund: string;
  declare solAmount: string; // Using string for u64 to avoid precision loss
  declare rewardsSplit: Recipient[]; // Using JSONB for Vec<SplitShareArgV0>
  declare rewardsSchedule: string;
  declare assetReturnAddress: string;
  declare bumpSeed: number;
  declare uniqueId: string;
}

// Export the inferred attributes type for use elsewhere
export type WelcomePackAttributes = InferAttributes<WelcomePack>;

export interface WelcomePackWithStatus extends WelcomePackAttributes {
  loading?: boolean;
  hotspot: Hotspot | null;
}

WelcomePack.init(
  {
    address: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    uniqueId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    owner: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    asset: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lazyDistributor: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    rewardsMint: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    rentRefund: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    solAmount: {
      type: DataTypes.BIGINT,
      allowNull: false,
      get() {
        const value = this.getDataValue("solAmount" as any);
        return value ? value.toString() : "0";
      },
    },
    rewardsSplit: {
      type: DataTypes.JSONB,
      allowNull: false,
      get() {
        const splits = this.getDataValue("rewardsSplit");
        if (!Array.isArray(splits)) return [];
        return splits.map((split: any) => {
          if (split.share?.fixed) {
            return {
              address: split.wallet ?? split.address,
              type: "fixed" as const,
              tokenAmount: {
                amount: String(split.share.fixed.amount),
                mint: HNT_MINT.toBase58(),
              },
            };
          }
          return {
            address: split.wallet ?? split.address,
            type: "percentage" as const,
            amount: split.share?.share?.amount ?? split.amount ?? 0,
          };
        });
      },
    },
    rewardsSchedule: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    assetReturnAddress: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    bumpSeed: {
      type: DataTypes.SMALLINT,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "welcome_packs",
    timestamps: false,
    underscored: true,
  },
);

export default WelcomePack;
