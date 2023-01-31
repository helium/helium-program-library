import {Sequelize, STRING, INTEGER, Model, INET} from 'sequelize';

// initialize sequelize
export const sequelize = new Sequelize('database', 'postgres', 'postgres', {
  host: 'localhost',
  dialect: 'postgres',
  logging: false,
});

export class Entity extends Model {}
Entity.init({
  assetId: {
    type: STRING,
    primaryKey: true,
  },
  hotspotKey: {
    type: STRING,
  },
  maker: {
    type: STRING,
  }
}, { sequelize, modelName: 'entity'})

export class IotMetadata extends Model {}
IotMetadata.init({
  assetId: {
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
}, { sequelize, modelName: 'iotmetadata'});

export class MobileMetadata extends Model {}
MobileMetadata.init({
  assetId: {
    type: STRING,
    primaryKey: true,
  },
  location: {
    type: STRING,
  }
}, { sequelize, modelName: "mobilemetadata"})
