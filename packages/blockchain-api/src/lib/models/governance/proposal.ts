import {
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../../db";

export class Proposal extends Model<
  InferAttributes<Proposal, { omit: never }>,
  InferCreationAttributes<Proposal>
> {
  declare address: string;
  declare namespace: string;
  declare owner: string;
  declare state: object;
  declare createdAt: number;
  declare proposalConfig: string;
  declare maxChoicesPerVoter: number;
  declare seed: Buffer;
  declare name: string;
  declare uri: string;
  declare tags: string[];
  declare choices: object[];
  declare bumpSeed: number;
  declare refreshedAt: Date;
}

Proposal.init(
  {
    address: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    namespace: DataTypes.STRING,
    owner: DataTypes.STRING,
    state: DataTypes.JSONB,
    createdAt: DataTypes.DECIMAL,
    proposalConfig: DataTypes.STRING,
    maxChoicesPerVoter: DataTypes.INTEGER,
    seed: DataTypes.BLOB,
    name: DataTypes.STRING,
    uri: DataTypes.STRING,
    tags: DataTypes.ARRAY(DataTypes.STRING),
    choices: DataTypes.ARRAY(DataTypes.JSONB),
    bumpSeed: DataTypes.INTEGER,
    refreshedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: "proposal",
    tableName: "proposals",
    underscored: true,
    timestamps: false,
  },
);
