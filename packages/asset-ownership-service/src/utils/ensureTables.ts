import { Sequelize } from "sequelize";
import {
  PG_ASSET_TABLE,
  PG_CARRIER_TABLE,
  PG_DATA_ONLY_TABLE,
  PG_MAKER_TABLE,
} from "../env";

const REQUIRED_TABLES = [
  { name: PG_MAKER_TABLE, requiredColumn: "merkle_tree" },
  { name: PG_DATA_ONLY_TABLE, requiredColumn: "merkle_tree" },
  { name: PG_CARRIER_TABLE, requiredColumn: "merkle_tree" },
  { name: PG_ASSET_TABLE, requiredColumn: "asset" },
];

const assertEnvVarsDefined = () => {
  REQUIRED_TABLES.forEach(({ name }, idx) => {
    if (!name) {
      throw new Error(`Table env var undefined: REQUIRED_TABLES index ${idx}`);
    }
  });
};

const assertTablesExist = async (sequelize: Sequelize) => {
  const tableNames = await sequelize.getQueryInterface().showAllTables();
  REQUIRED_TABLES.forEach(({ name }) => {
    if (name && !tableNames.includes(name)) {
      throw new Error(`Required table missing: ${name}`);
    }
  });
};

const assertRequiredColumns = async (sequelize: Sequelize) => {
  for (const { name, requiredColumn } of REQUIRED_TABLES) {
    if (!name) continue;
    const tableDescription = await sequelize
      .getQueryInterface()
      .describeTable(name);

    if (!tableDescription[requiredColumn]) {
      throw new Error(
        `Table ${name} must have a column labeled '${requiredColumn}'`
      );
    }
  }
};

export const ensureTables = async ({ sequelize }: { sequelize: Sequelize }) => {
  assertEnvVarsDefined();
  await assertTablesExist(sequelize);
  await assertRequiredColumns(sequelize);
};
