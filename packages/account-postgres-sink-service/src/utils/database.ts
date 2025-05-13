import { Model, STRING, Sequelize } from "sequelize";
import AWS from "aws-sdk";
import * as pg from "pg";
import { PG_POOL_SIZE } from "../env";
import pLimit from "p-limit";

const host = process.env.PG_HOST || "localhost";
const port = Number(process.env.PG_PORT) || 5432;
export const limit = pLimit(PG_POOL_SIZE - 1);
export const database = new Sequelize({
  host: host,
  dialect: "postgres",
  port: port,
  logging: false,
  dialectModule: pg,
  username: process.env.PG_USER,
  database: process.env.PG_DATABASE,
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

      let password = process.env.PG_PASSWORD;
      if (isRds && !password) {
        const signer = new AWS.RDS.Signer({
          region: process.env.AWS_REGION,
          hostname: process.env.PGHOST,
          port,
          username: process.env.PG_USER,
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
    service: {
      type: STRING,
      unique: true,
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
