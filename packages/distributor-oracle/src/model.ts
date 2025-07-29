import { Sequelize, STRING, BIGINT, Model, ARRAY } from "sequelize";
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

export class Reward extends Model {
  declare address: string;
  declare rewards: string;
}

Reward.init(
  {
    address: {
      type: STRING,
      primaryKey: true,
    },
    rewards: {
      type: BIGINT,
    },
    lastReward: {
      type: "TIMESTAMP",
    },
    rewardType: {
      type: STRING,
    },
  },
  {
    sequelize,
    modelName: "reward_index",
    tableName: "reward_index",
    underscored: true,
    timestamps: false,
  }
);

export class WalletClaimJob extends Model {
  declare wallet: string;
  declare remainingKtas: string[];
}
WalletClaimJob.init(
  {
    wallet: {
      type: STRING,
      primaryKey: true,
    },
    remainingKtas: {
      type: ARRAY(STRING),
    },
  },
  {
    sequelize,
    modelName: "wallet_claim_jobs",
    tableName: "wallet_claim_jobs",
    underscored: true,
    timestamps: false,
  }
);

export class AssetOwner extends Model {
  declare asset: string;
  declare owner: string;
  // declare createdAt: Date;
  // declare updatedAt: Date;
}
AssetOwner.init(
  {
    asset: {
      type: STRING,
      primaryKey: false,
    },
    owner: {
      type: STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "asset_owners",
    tableName: "asset_owners",
    underscored: true,
    timestamps: false,
  }
);

export class KeyToAsset extends Model {
  declare address: string;
  declare dao: string | null;
  declare asset: string | null;
  declare entityKey: Buffer | null;
  // declare bumpSeed: number | null;
  // declare keySerialization: object | null;
  // declare refreshedAt: Date | null;
  // declare createdAt: Date;
  declare encodedEntityKey: string | null;
}
KeyToAsset.init(
  {
    address: {
      type: STRING,
      primaryKey: true,
    },
    dao: {
      type: STRING,
      allowNull: false,
    },
    asset: {
      type: STRING,
      allowNull: false,
    },
    entityKey: {
      type: "BYTEA",
      allowNull: false,
      field: "entity_key",
    },
    encodedEntityKey: {
      type: "TEXT",
      allowNull: true,
      field: "encoded_entity_key",
    },
  },
  {
    sequelize,
    modelName: "key_to_assets",
    tableName: "key_to_assets",
    underscored: true,
    timestamps: false,
  }
);

export class Recipient extends Model {
  declare address: string;
  declare lazyDistributor: string | null;
  declare asset: string | null;
  declare totalRewards: string | null;
  // declare currentConfigVersion: number | null;
  // declare currentRewards: string[] | null;
  // declare bumpSeed: number | null;
  // declare reserved: string | null;
  declare destination: string | null;
  // declare refreshedAt: Date | null;
  // declare createdAt: Date;
}
Recipient.init(
  {
    address: {
      type: STRING,
      primaryKey: false,
    },
    lazyDistributor: {
      type: STRING,
      allowNull: false,
      field: "lazy_distributor",
    },
    asset: {
      type: STRING,
      allowNull: false,
    },
    totalRewards: {
      type: "NUMERIC",
      allowNull: false,
      field: "total_rewards",
    },
    destination: {
      type: STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "recipients",
    tableName: "recipients",
    underscored: true,
    timestamps: false,
  }
);

KeyToAsset.hasOne(Recipient, { foreignKey: "asset", sourceKey: "asset" });
Recipient.belongsTo(KeyToAsset, { foreignKey: "asset", targetKey: "asset" });
KeyToAsset.hasOne(AssetOwner, { foreignKey: "asset", sourceKey: "asset" });
AssetOwner.belongsTo(KeyToAsset, { foreignKey: "asset", targetKey: "asset" });
AssetOwner.belongsTo(Recipient, { foreignKey: "asset", targetKey: "asset" });
Recipient.hasOne(AssetOwner, { foreignKey: "asset", sourceKey: "asset" });
KeyToAsset.hasOne(Reward, {
  foreignKey: "address",
  sourceKey: "encodedEntityKey",
});
Reward.belongsTo(KeyToAsset, {
  foreignKey: "address",
  targetKey: "encodedEntityKey",
});
