import {Sequelize, STRING, INTEGER, Model, INET} from 'sequelize';

// initialize sequelize
export const sequelize = new Sequelize('oracle', 'oracle_admin', 'password', {
  host: 'localhost',
  dialect: 'postgres',
  port: 5433,
  logging: false,
  dialectOptions: {
      "ssl": {
        "require": false,
        "rejectUnauthorized": false
      }
    }
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
  }
}, { sequelize, underscored: true, modelName: "mobile_metadata"})
