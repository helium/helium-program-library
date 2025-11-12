import AWS from "aws-sdk";
import BN from "bn.js";
import { cellToLatLng, cellToParent } from "h3-js";
import * as pg from "pg";
import { DataTypes, Model, STRING, Sequelize } from "sequelize";

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

class WithRes8LatLgn extends Model {
  declare location: string;

  _lat: number | undefined = undefined;
  _long: number | undefined = undefined;

  setLatLng() {
    if (this.location) {
      try {
        const res8 = cellToParent(new BN(this.location).toString("hex"), 8);
        const [latRes8, longRes8] = cellToLatLng(res8);
        if (latRes8) {
          this._lat = Number(latRes8.toFixed(6));
        }
        if (longRes8) {
          this._long = Number(longRes8.toFixed(6));
        }
      } catch (e: any) {
        console.error("Invalid location", e);
      }
    }
  }

  get lat(): number | undefined {
    if (this._lat) {
      return this._lat;
    }

    this.setLatLng();
    return this._lat;
  }

  get long(): number | undefined {
    if (this._long) {
      return this._long;
    }

    this.setLatLng();
    return this._long;
  }
}

export class MobileHotspotInfo extends WithRes8LatLgn {
  declare address: string;
  declare asset: string;
  declare street: string;
  declare city: string;
  declare state: string;
  declare country: string;
  declare location: string;
  declare is_active: boolean;
  declare device_type: string;
  declare created_at: Date;
}
MobileHotspotInfo.init(
  {
    address: {
      type: STRING,
      primaryKey: true,
    },
    asset: DataTypes.STRING,
    street: DataTypes.STRING,
    city: DataTypes.STRING,
    state: DataTypes.STRING,
    country: DataTypes.STRING,
    is_active: DataTypes.BOOLEAN,
    device_type: DataTypes.JSONB,
    location: DataTypes.DECIMAL.UNSIGNED,
    dc_onboarding_fee_paid: DataTypes.DECIMAL.UNSIGNED,
    created_at: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: "mobile_hotspot_info",
    tableName: "mobile_hotspot_infos",
    underscored: true,
    timestamps: false,
  }
);

export class IotHotspotInfo extends WithRes8LatLgn {
  declare address: string;
  declare asset: string;
  declare street: string;
  declare city: string;
  declare state: string;
  declare country: string;
  declare location: string;
  declare is_active: boolean;
  declare created_at: Date;
}

IotHotspotInfo.init(
  {
    address: {
      type: STRING,
      primaryKey: true,
    },
    street: DataTypes.STRING,
    city: DataTypes.STRING,
    state: DataTypes.STRING,
    country: DataTypes.STRING,
    is_active: DataTypes.BOOLEAN,
    location: DataTypes.DECIMAL.UNSIGNED,
    dc_onboarding_fee_paid: DataTypes.DECIMAL.UNSIGNED,
    elevation: DataTypes.NUMBER,
    gain: DataTypes.NUMBER,
    created_at: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: "iot_hotspot_info",
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
  declare key_serialization: string;
}

KeyToAsset.init(
  {
    address: {
      type: STRING,
      primaryKey: true,
    },
    entity_key: DataTypes.BLOB,
    asset: STRING,
    key_serialization: DataTypes.JSONB,
  },
  {
    sequelize,
    modelName: "key_to_asset",
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
