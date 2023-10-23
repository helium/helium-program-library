import { Sequelize } from "sequelize";

export const createPgIndexes = async ({
  indexConfigs,
  sequelize
}: {
  indexConfigs: string[],
  sequelize: Sequelize;
}) => {
  try {
    if (indexConfigs.length === 0) {
      console.log("createPgIndexes: No indexes created!");
      return;
    }

    const indexPromises = indexConfigs.map((config) => {
      return sequelize.query(config);
    });

    await Promise.all(indexPromises);

    console.log("createPgIndexes: Indexes created!");
  } catch (err) {
    console.error("createPgIndexes: Index creation failed");
    console.error(err);
  }
};