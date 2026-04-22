import {
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../../db";

export class ProxyAssignment extends Model<
  InferAttributes<ProxyAssignment, { omit: never }>,
  InferCreationAttributes<ProxyAssignment>
> {
  declare address: string;
  declare voter: string;
  declare nextVoter: string;
  declare index: number;
  declare asset: string;
  declare proxyConfig: string;
  declare rentRefund: string;
  declare bumpSeed: number;
  declare expirationTime: string;
}

ProxyAssignment.init(
  {
    address: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    voter: DataTypes.STRING,
    nextVoter: DataTypes.STRING,
    index: DataTypes.INTEGER,
    asset: DataTypes.STRING,
    proxyConfig: DataTypes.STRING,
    rentRefund: DataTypes.STRING,
    bumpSeed: DataTypes.INTEGER,
    expirationTime: DataTypes.DECIMAL.UNSIGNED,
  },
  {
    sequelize,
    modelName: "proxy_assignment",
    tableName: "proxy_assignments",
    underscored: true,
    timestamps: false,
  },
);
