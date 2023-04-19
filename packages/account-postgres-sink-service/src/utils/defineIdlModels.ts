import * as anchor from "@coral-xyz/anchor";
import { underscore } from "inflection";
import { Sequelize, DataTypes } from "sequelize";
import { provider } from "./solana";
import cachedIdlFetch from "./cachedIdlFetch";

const TypeMap = new Map<string, any>([
  ["string", DataTypes.STRING],
  ["publicKey", DataTypes.STRING],
  ["i16", DataTypes.INTEGER],
  ["u8", DataTypes.INTEGER.UNSIGNED],
  ["i16", DataTypes.INTEGER],
  ["u16", DataTypes.INTEGER.UNSIGNED],
  ["i32", DataTypes.INTEGER],
  ["u32", DataTypes.INTEGER.UNSIGNED],
  ["i64", DataTypes.BIGINT],
  ["u64", DataTypes.BIGINT.UNSIGNED],
  ["i128", DataTypes.DECIMAL],
  ["u128", DataTypes.DECIMAL.UNSIGNED],
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
    } else if (key === "vec") {
      const vecType = value;
      return DataTypes.ARRAY(determineType(vecType));
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
  for (const acc of idl.accounts!) {
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
          refreshed_at: {
            type: DataTypes.DATE,
          },
        },
        {
          underscored: true,
          updatedAt: false,
          schema: underscore(accConfig.schema || "public"),
          tableName: underscore(accConfig.table || acc.name),
        }
      );
    }
  }
};

export const defineAllIdlModels = async ({
  configs,
  sequelize,
}: {
  configs: {
    accounts: { type: string; table?: string; schema?: string }[];
    programId: string;
  }[];
  sequelize: Sequelize;
}) => {
  for (const config of configs) {
    const idl = await cachedIdlFetch.fetchIdl({
      programId: config.programId,
      skipCache: true,
      provider,
    });

    if (!idl) {
      throw new Error(`unable to fetch idl for ${config.programId}`);
    }

    if (
      !config.accounts.every(({ type }) =>
        idl.accounts!.some(({ name }) => name === type)
      )
    ) {
      throw new Error("idl does not have every account type");
    }

    await defineIdlModels({
      idl,
      accounts: config.accounts,
      sequelize,
    });
  }
  await sequelize.sync({ alter: true });
};
