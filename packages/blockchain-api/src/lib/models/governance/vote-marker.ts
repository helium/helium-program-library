import {
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../../db";

export class VoteMarker extends Model<
  InferAttributes<VoteMarker, { omit: never }>,
  InferCreationAttributes<VoteMarker>
> {
  declare address: string;
  declare voter: string;
  declare registrar: string;
  declare proposal: string;
  declare mint: string;
  declare choices: number[];
  declare weight: string;
  declare proxyIndex: number;
}

VoteMarker.init(
  {
    address: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    voter: DataTypes.STRING,
    registrar: DataTypes.STRING,
    proposal: DataTypes.STRING,
    mint: DataTypes.STRING,
    choices: DataTypes.JSONB,
    weight: DataTypes.DECIMAL(38, 0).UNSIGNED,
    proxyIndex: DataTypes.INTEGER,
  },
  {
    sequelize,
    modelName: "vote_marker",
    tableName: "vote_markers",
    underscored: true,
    timestamps: false,
    indexes: [{ fields: ["voter"] }, { fields: ["proposal"] }],
  },
);
