import { Sequelize } from "sequelize";

export const createPgIndexes = async ({
  sequelize,
}: {
  sequelize: Sequelize;
}) => {
  try {
    await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS key_to_asset_asset_index ON key_to_assets(asset);
    `);
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS iot_hotspot_infos_asset_index ON iot_hotspot_infos(asset);
    `);
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS mobile_hotspot_infos_asset_index ON mobile_hotspot_infos(asset);
    `);
  } catch (err) {
    console.error("createPgIndexes: Index creation failed");
    console.error(err);
  }
};

export default createPgIndexes;