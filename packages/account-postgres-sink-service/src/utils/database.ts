import { Model, STRING, Sequelize } from "sequelize";
import AWS from "aws-sdk";
import * as pg from "pg";
import { PG_POOL_SIZE } from "../env";
import pLimit from "p-limit";

const host = process.env.PGHOST || "localhost";
const port = Number(process.env.PGPORT) || 5432;
export const limit = pLimit(PG_POOL_SIZE - 1);
export const database = new Sequelize({
  host: host,
  dialect: "postgres",
  port: port,
  logging: false,
  dialectModule: pg,
  username: process.env.PGUSER,
  database: process.env.PGDATABASE,
  pool: {
    max: PG_POOL_SIZE,
    min: 5,
    acquire: 60000,
    idle: 10000,
    validate: (client: any) => {
      try {
        client.query("SELECT 1");
        return true;
      } catch (err) {
        return false;
      }
    },
  },
  hooks: {
    beforeConnect: async (config: any) => {
      const isRds = host.includes("rds.amazonaws.com");

      let password = process.env.PGPASSWORD;
      if (isRds && !password) {
        const signer = new AWS.RDS.Signer({
          region: process.env.AWS_REGION,
          hostname: process.env.PGHOST,
          port,
          username: process.env.PGUSER,
        });
        password = await new Promise((resolve, reject) =>
          signer.getAuthToken({}, (err, token) => {
            if (err) {
              return reject(err);
            }
            resolve(token);
          })
        );
        config.dialectOptions = {
          ssl: {
            require: false,
            rejectUnauthorized: false,
          },
        };
      }
      config.password = password;
    },
  },
});

export class Cursor extends Model {
  declare cursor: string;
}

Cursor.init(
  {
    cursor: {
      type: STRING,
      primaryKey: true,
    },
    blockHeight: {
      type: STRING,
    },
  },
  {
    sequelize: database,
    modelName: "cursor",
    tableName: "cursors",
    underscored: true,
    timestamps: true,
  }
);

export default database;
