import { Sequelize } from "sequelize";
import { PG_ASSET_TABLE, PG_CARRIER_TABLE, PG_MAKER_TABLE } from "../env";

export const ensureTables = async ({ sequelize }: { sequelize: Sequelize }) => {
  if (!PG_MAKER_TABLE) throw new Error("PG_MAKER_TABLE undefined");
  if (!PG_CARRIER_TABLE) throw new Error("PG_CARRIER_TABLE undefined");
  if (!PG_ASSET_TABLE) throw new Error("PG_ASSET_TABLE undefined");
  const tableNames = await sequelize.getQueryInterface().showAllTables();
  if (
    ![PG_MAKER_TABLE, PG_CARRIER_TABLE, PG_ASSET_TABLE].every((requiredTable) =>
      tableNames.includes(requiredTable)
    )
  ) {
    throw new Error("Required tables dont exist in the databse");
  }

  const assetTableDescription = await sequelize
    .getQueryInterface()
    .describeTable(PG_ASSET_TABLE);

  if (!assetTableDescription.asset) {
    throw new Error(
      `Table ${PG_ASSET_TABLE} must have a column labeled 'asset'`
    );
  }

  const makerTableDescription = await sequelize
    .getQueryInterface()
    .describeTable(PG_MAKER_TABLE);

  if (!makerTableDescription.merkle_tree) {
    throw new Error(
      `Table ${PG_MAKER_TABLE} must have a column labeled 'merkle_tree'`
    );
  }

  const carrierTableDescription = await sequelize
    .getQueryInterface()
    .describeTable(PG_CARRIER_TABLE);

  if (!carrierTableDescription.merkle_tree) {
    throw new Error(
      `Table ${PG_CARRIER_TABLE} must have a column labeled 'merkle_tree'`
    );
  }
};
