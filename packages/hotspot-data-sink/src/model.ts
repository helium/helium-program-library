import {Sequelize, STRING, INTEGER, Model, INET} from 'sequelize';
import AWS from "aws-sdk";
import * as pg from "pg";
import { BOOLEAN } from 'sequelize';

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
    idle: 10000
  },
  dialectOptions: {
          ssl: {
            require: false,
            rejectUnauthorized: false,
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

export class Entity extends Model {}
Entity.init({
  hotspotKey: {
    type: STRING,
    primaryKey: true,
  },
  assetId: {
    type: STRING,
  },
  maker: {
    type: STRING,
  }
}, { sequelize, modelName: 'entities', underscored: true})

export class IotMetadata extends Model {}
IotMetadata.init({
  hotspotKey: {
    type: STRING,
    primaryKey: true,
  },
  location: {
    type: STRING,
  },
  elevation: {
    type: INTEGER,
  },
  gain: {
    type: INTEGER,
  },
  isFullHotspot: {
    type: BOOLEAN,
  }
}, { sequelize, underscored: true, modelName: 'iot_metadata'});

export class MobileMetadata extends Model {}
MobileMetadata.init({
  hotspotKey: {
    type: STRING,
    primaryKey: true,
  },
  location: {
    type: STRING,
  },
  isFullHotspot: {
    type: BOOLEAN,
  }
}, { sequelize, underscored: true, modelName: "mobile_metadata"})
