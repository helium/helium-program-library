import {Sequelize, STRING, INTEGER, Model} from 'sequelize';


// initialize sequelize
export const sequelize = new Sequelize('database', 'postgres', 'postgres', {
  host: 'localhost',
  dialect: 'postgres',
  logging: false,
});

export class Hotspot extends Model {}
Hotspot.init({
  asset: {
    type: STRING,
  },
  hotspot_key: {
    type: STRING,
    primaryKey: true,
  },
  location: {
    type: STRING,
  },
  elevation: {
    type: INTEGER
  },
  gain: {
    type: INTEGER
  },
}, { sequelize, modelName: 'hotspot' });

