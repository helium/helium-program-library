import {
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../../db";

export class Registrar extends Model<
  InferAttributes<Registrar, { omit: never }>,
  InferCreationAttributes<Registrar>
> {
  declare address: string;
  declare governanceProgramId: string;
  declare realm: string;
  declare realmGoverningTokenMint: string;
  declare realmAuthority: string;
  declare votingMints: {
    mint: string;
    baselineVoteWeightScaledFactor: string;
    maxExtraLockupVoteWeightScaledFactor: string;
    genesisVotePowerMultiplier: number;
    genesisVotePowerMultiplierExpiration: bigint;
    lockupSaturationSecs: string;
    digitShift: number;
  }[];
}

Registrar.init(
  {
    address: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    governanceProgramId: DataTypes.STRING,
    realm: DataTypes.STRING,
    realmGoverningTokenMint: DataTypes.STRING,
    realmAuthority: DataTypes.STRING,
    votingMints: {
      type: DataTypes.JSONB,
      field: "voting_mints",
    },
  },
  {
    sequelize,
    modelName: "registrar",
    tableName: "registrars",
    underscored: true,
    timestamps: false,
  },
);
