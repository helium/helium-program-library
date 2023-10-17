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
  declare asset: string;
  declare city: string;
  declare state: string;
  declare country: string;
}
MobileHotspotInfo.init(
  {
    address: {
      type: STRING,
      primaryKey: true,
    },
    city: DataTypes.STRING,
    state: DataTypes.STRING,
    country: DataTypes.STRING,
    asset: DataTypes.STRING,
    refreshedAt: DataTypes.TIME,
    isFullHotspot: DataTypes.BOOLEAN,
    numLocationAsserts: DataTypes.NUMBER,
    isActive: DataTypes.BOOLEAN,
    dcOnboardingFeePaid: DataTypes.DECIMAL.UNSIGNED,
    deviceType: DataTypes.JSONB,
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
  declare city: string;
  declare state: string;
  declare country: string;
}
IotHotspotInfo.init(
  {
    address: {
      type: STRING,
      primaryKey: true,
    },
    asset: DataTypes.STRING,
    city: DataTypes.STRING,
    state: DataTypes.STRING,
    country: DataTypes.STRING,
    location: DataTypes.DECIMAL.UNSIGNED,
    isFullHotspot: DataTypes.BOOLEAN,
    numLocationAsserts: DataTypes.NUMBER,
    isActive: DataTypes.BOOLEAN,
    dcOnboardingFeePaid: DataTypes.DECIMAL.UNSIGNED,
    refreshedAt: DataTypes.TIME,
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
  declare entityKey: Buffer;
  declare entityKeyStr?: string;
  declare keySerialization: any;
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
    keySerialization: DataTypes.JSONB,
    asset: DataTypes.STRING,
    refreshedAt: DataTypes.TIME,
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
  foreignKey: "asset",
});
