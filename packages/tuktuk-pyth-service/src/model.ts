import { Sequelize, STRING, BIGINT, Model, ARRAY, TEXT } from "sequelize";
import AWS from "aws-sdk";
import * as pg from "pg";

const host = process.env.PGHOST || "localhost";
const port = Number(process.env.PGPORT) || 5432;
export const sequelize = new Sequelize({
  host: host,
  dialect: "postgres",
  port: port,
  logging: false,
  dialectModule: pg,
  username: process.env.PGUSER,
  database: process.env.PGDATABASE,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
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

export class PythPriceUpdate extends Model {
  declare priceUpdateId: string;
  declare priceUpdate: string;
  declare updatedAt: Date;
}
PythPriceUpdate.init(
  {
    priceUpdateId: {
      type: STRING,
      primaryKey: true,
    },
    priceUpdate: {
      type: TEXT,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "pyth_price_updates",
    tableName: "pyth_price_updates",
    underscored: true,
    timestamps: true,
  }
);
