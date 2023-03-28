import * as anchor from "@coral-xyz/anchor";
import { underscore } from "inflection";
import { Sequelize, DataTypes } from "sequelize";

const TypeMap = new Map<string, any>([
  ["publicKey", DataTypes.STRING],
  ["i16", DataTypes.INTEGER],
  ["u8", DataTypes.INTEGER.UNSIGNED],
  ["i16", DataTypes.INTEGER],
  ["u16", DataTypes.INTEGER.UNSIGNED],
  ["i32", DataTypes.INTEGER],
  ["u32", DataTypes.INTEGER.UNSIGNED],
  ["i64", DataTypes.BIGINT],
  ["u64", DataTypes.BIGINT.UNSIGNED],
  ["bool", DataTypes.BOOLEAN],
]);

const determineType = (type: string | object): any => {
  if (typeof type === "string" && TypeMap.has(type)) {
    return TypeMap.get(type);
  }

  if (typeof type === "object") {
    const [key, value] = Object.entries(type)[0];

    if (key === "array" && Array.isArray(value)) {
      const [arrayType] = value;
      if (TypeMap.has(arrayType)) {
        return DataTypes.ARRAY(TypeMap.get(arrayType));
      }
    } else {
      return determineType(value);
    }
  }

  return DataTypes.JSONB;
};

export const defineIdlModels = async ({
  idl,
  accounts,
  sequelize,
}: {
  idl: anchor.Idl;
  accounts: { type: string; table?: string; schema?: string }[];
  sequelize: Sequelize;
}) => {
  for (const acc of idl.accounts) {
    const accConfig = accounts.find(({ type }) => type === acc.name);

    if (accConfig) {
      let schema: { [key: string]: any } = {};
      for (const field of acc.type.fields) {
        schema[acc.name] = {
          ...schema[acc.name],
          [field.name]: determineType(field.type),
        };
      }

      if (accConfig.schema) {
        await sequelize.createSchema(accConfig.schema, {});
      }

      sequelize.define(
        acc.name,
        {
          address: {
            type: DataTypes.STRING,
            primaryKey: true,
          },
          ...schema[acc.name],
        },
        {
          underscored: true,
          schema: underscore(accConfig.schema || "public"),
          tableName: underscore(accConfig.table || acc.name),
        }
      );
    }
  }
};
