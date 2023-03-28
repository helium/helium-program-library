import { Sequelize } from "sequelize";
import AWS from "aws-sdk";
import * as pg from "pg";
import {
  PG_HOST,
  PG_PORT,
  PG_DATABASE,
  PG_USER,
  PG_PASSWORD,
  AWS_REGION,
} from "../env";

const database = new Sequelize({
  host: PG_HOST,
  dialect: "postgres",
  port: PG_PORT,
  logging: false,
  dialectModule: pg,
  username: PG_USER,
  database: PG_DATABASE,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  hooks: {
    beforeConnect: async (config: any) => {
      const isRds = PG_HOST.includes("rds.amazonaws.com");

      let password = PG_PASSWORD;
      if (isRds && !password) {
        const signer = new AWS.RDS.Signer({
          region: AWS_REGION,
          hostname: PG_HOST,
          port: PG_PORT,
          username: PG_USER,
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

export default database;
