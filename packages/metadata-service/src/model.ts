import { Sequelize, STRING, Model, DataTypes } from "sequelize";
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

export class MobileHotspotInfo extends Model {
  declare address: string;
  declare street: string;
  declare city: string;
  declare state: string;
  declare country: string;
  declare lat: number;
  declare long: number;
}
MobileHotspotInfo.init(
  {
    address: {
      type: STRING,
      primaryKey: true,
    },
    street: DataTypes.STRING,
    lat: DataTypes.DECIMAL(8, 6),
    long: DataTypes.DECIMAL(9, 6),
    city: DataTypes.STRING,
    state: DataTypes.STRING,
    country: DataTypes.STRING,
  },
  {
    sequelize,
    modelName: "mobile_hotspot_infos",
    tableName: "mobile_hotspot_infos",
    underscored: true,
    timestamps: false,
  }
);

export class IotHotspotInfo extends Model {
  declare address: string;
  declare asset: string;
  declare street: string;
  declare city: string;
  declare state: string;
  declare country: string;
  declare lat: number;
  declare long: number;
}
IotHotspotInfo.init(
  {
    address: {
      type: STRING,
      primaryKey: true,
    },
    street: DataTypes.STRING,
    lat: DataTypes.DECIMAL(8, 6),
    long: DataTypes.DECIMAL(9, 6),
    city: DataTypes.STRING,
    state: DataTypes.STRING,
    country: DataTypes.STRING,
  },
  {
    sequelize,
    modelName: "iot_hotspot_infos",
    tableName: "iot_hotspot_infos",
    underscored: true,
    timestamps: false,
  }
);

export class KeyToAsset extends Model {
  declare address: string;
  declare asset: string;
  declare entity_key: Buffer;
  declare mobile_hotspot_info?: MobileHotspotInfo;
  declare iot_hotspot_info?: IotHotspotInfo;
}
KeyToAsset.init(
  {
    address: {
      type: STRING,
      primaryKey: true,
    },
    entityKey: DataTypes.BLOB,
    asset: STRING,
  },
  {
    sequelize,
    modelName: "key_to_assets",
    tableName: "key_to_assets",
    underscored: true,
    timestamps: false,
  }
);

KeyToAsset.hasOne(IotHotspotInfo, {
  sourceKey: "asset",
  foreignKey: "asset",
});
KeyToAsset.hasOne(MobileHotspotInfo, {
  sourceKey: "asset",
  foreignKey: "asset"
});
