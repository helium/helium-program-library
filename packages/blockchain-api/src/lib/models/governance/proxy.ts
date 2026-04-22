import {
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../../db";

export class Proxy extends Model<
  InferAttributes<Proxy, { omit: never }>,
  InferCreationAttributes<Proxy>
> {
  declare name: string;
  declare image: string;
  declare wallet: string;
  declare description: string;
  declare detail: string;
  declare createdAt?: Date;
  declare updatedAt?: Date;
}

Proxy.init(
  {
    name: {
      type: DataTypes.STRING,
      unique: true,
    },
    image: DataTypes.STRING,
    wallet: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    description: DataTypes.STRING,
    detail: DataTypes.STRING,
  },
  {
    sequelize,
    modelName: "proxy",
    tableName: "proxies",
    underscored: true,
    timestamps: true,
  },
);
