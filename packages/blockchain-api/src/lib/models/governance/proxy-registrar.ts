import {
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../../db";

export class ProxyRegistrar extends Model<
  InferAttributes<ProxyRegistrar, { omit: never }>,
  InferCreationAttributes<ProxyRegistrar>
> {
  declare registrar: string;
  declare wallet: string;
  declare createdAt?: Date;
  declare updatedAt?: Date;
}

ProxyRegistrar.init(
  {
    registrar: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    wallet: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "proxy_registrar",
    tableName: "proxy_registrars",
    underscored: true,
    timestamps: true,
    indexes: [
      { unique: true, fields: ["registrar", "wallet"] },
      { fields: ["registrar"] },
      { fields: ["wallet"] },
    ],
  },
);
