import * as anchor from "@coral-xyz/anchor";
import { camelize, underscore } from "inflection";
import { DataTypes, QueryTypes, Sequelize } from "sequelize";
import { initPlugins } from "../plugins";
import { IAccountConfig, IConfig } from "../types";
import cachedIdlFetch from "./cachedIdlFetch";
import { provider } from "./solana";

const TypeMap = new Map<string, any>([
  ["string", DataTypes.STRING],
  ["publicKey", DataTypes.STRING],
  ["i16", DataTypes.INTEGER],
  ["u8", DataTypes.INTEGER.UNSIGNED],
  ["i16", DataTypes.INTEGER],
  ["u16", DataTypes.INTEGER.UNSIGNED],
  ["i32", DataTypes.DECIMAL],
  ["u32", DataTypes.DECIMAL.UNSIGNED],
  ["i64", DataTypes.DECIMAL],
  ["u64", DataTypes.DECIMAL.UNSIGNED],
  ["i128", DataTypes.DECIMAL],
  ["u128", DataTypes.DECIMAL.UNSIGNED],
  ["bool", DataTypes.BOOLEAN],
  ["bytes", DataTypes.BLOB],
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
  accounts: IAccountConfig[];
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

      (await initPlugins(accConfig?.plugins)).map(
        (plugin) => plugin?.addFields && plugin.addFields(schema, acc.name)
      );

      if (accConfig.schema) {
        await sequelize.createSchema(accConfig.schema, {});
      }

      const model = sequelize.define(
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
          createdAt:
            !schema[acc.name] ||
            (!schema[acc.name].createdAt && !schema[acc.name].created_at),
        }
      );

      const columns = Object.keys(model.getAttributes()).map((att) =>
        camelize(att, true)
      );

      const existingColumns = (
        await sequelize.query(
          `
        SELECT column_name
          FROM information_schema.columns
        WHERE table_schema = '${underscore(accConfig.schema || "public")}'
          AND table_name = '${underscore(accConfig.table || acc.name)}'
      `,
          { type: QueryTypes.SELECT }
        )
      ).map((x: any) => camelize(x.column_name, true));

      if (
        !existingColumns.length ||
        !columns.every((col) => existingColumns.includes(col))
      ) {
        model.sync({ alter: true });
      }
    }
  }
};

export const defineAllIdlModels = async ({
  configs,
  sequelize,
}: {
  configs: IConfig[];
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
      throw new Error(
        `idl does not have every account type ${
          config.accounts.find(
            ({ type }) => !idl.accounts!.some(({ name }) => name === type)
          )?.type
        }`
      );
    }

    await defineIdlModels({
      idl,
      accounts: config.accounts,
      sequelize,
    });
  }
};
