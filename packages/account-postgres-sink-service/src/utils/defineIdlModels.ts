import * as anchor from "@coral-xyz/anchor";
import { camelize, underscore } from "inflection";
import { DataTypes, QueryTypes, Sequelize } from "sequelize";
import { initPlugins } from "../plugins";
import { IAccountConfig, IConfig } from "../types";
import cachedIdlFetch from "./cachedIdlFetch";
import { provider } from "./solana";
import {
  IdlField,
  IdlTypeDef,
  IdlTypeDefTyStruct,
} from "@coral-xyz/anchor/dist/cjs/idl";
import { omit, pick } from "lodash";

const TypeMap = new Map<string, any>([
  ["string", DataTypes.STRING],
  ["pubkey", DataTypes.STRING],
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
    // @ts-ignore
    if (type.option) {
      // @ts-ignore
      return determineType(type.option);
    }
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

const shouldEnableCreatedAt = (schema: any, accName: string) => {
  const accSchema = schema[accName];
  return !accSchema || (!accSchema.createdAt && !accSchema.created_at);
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
  for (const acc of idl.accounts || []) {
    const typeDef = idl.types?.find((tdef) => tdef.name === acc.name);
    const accConfig = accounts.find(({ type }) => type === acc.name);
    if (accConfig) {
      let schema: { [key: string]: any } = {};
      for (const field of (
        (typeDef as any as IdlTypeDef).type as IdlTypeDefTyStruct
      ).fields || []) {
        if (typeof field != "string") {
          const fieldAsField = field as IdlField;
          const prunedFieldName = fieldAsField.name.replace(/^_+/, "");
          schema[acc.name] = {
            ...schema[acc.name],
            [camelize(prunedFieldName, true)]: determineType(fieldAsField.type),
          };
        }
      }

      (await initPlugins(accConfig?.plugins)).map((plugin) => {
        if (plugin?.addFields) plugin.addFields(schema, acc.name);
        if (plugin?.addIndexes) plugin.addIndexes(schema, acc.name);
      });

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
          ...omit(schema[acc.name] || {}, ["indexes"]),
          refreshed_at: {
            type: DataTypes.DATE,
          },
        },
        {
          underscored: true,
          updatedAt: false,
          schema: underscore(accConfig.schema || "public"),
          tableName: underscore(accConfig.table || acc.name),
          createdAt: shouldEnableCreatedAt(schema, acc.name),
          ...pick(schema[acc.name], "indexes"),
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
        idl.types!.some(
          ({ name, type: tdef }) =>
            (tdef as any as IdlTypeDefTyStruct).kind === "struct" &&
            name === type
        )
      )
    ) {
      throw new Error(
        `idl does not have every account type ${
          config.accounts.find(
            ({ type }) => !idl.types!.some(({ name }) => name === type)
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
