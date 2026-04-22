import {
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../../db";

export class Position extends Model<
  InferAttributes<Position, { omit: never }>,
  InferCreationAttributes<Position>
> {
  declare address: string;
  declare registrar: string;
  declare mint: string;
  declare asset: string;
  declare lockup: {
    startTs: string;
    endTs: string;
    kind: "none" | "cliff" | "constant";
  };
  declare amountDepositedNative: string;
  declare votingMintConfigIdx: number;
  declare numActiveVotes: number;
  declare genesisEnd: bigint;
  declare voteController: string;
  declare veTokens: bigint;
}

Position.init(
  {
    address: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    registrar: DataTypes.STRING,
    mint: DataTypes.STRING,
    asset: DataTypes.STRING,
    lockup: DataTypes.JSONB,
    amountDepositedNative: DataTypes.DECIMAL.UNSIGNED,
    votingMintConfigIdx: DataTypes.INTEGER,
    numActiveVotes: DataTypes.INTEGER,
    genesisEnd: DataTypes.BIGINT,
    voteController: DataTypes.STRING,
    veTokens: DataTypes.BIGINT.UNSIGNED,
  },
  {
    sequelize,
    modelName: "position",
    tableName: "positions_with_vetokens",
    underscored: true,
    timestamps: false,
  },
);
