import { Model, STRING, INTEGER, Sequelize, QueryTypes, Transaction } from "sequelize";
import AWS from "aws-sdk";
import * as pg from "pg";
import { PG_POOL_SIZE } from "../env";
import pLimit from "p-limit";

const host = process.env.PG_HOST || "localhost";
const port = Number(process.env.PG_PORT) || 5432;
export const limit = pLimit(PG_POOL_SIZE - 1);
export const database = new Sequelize({
  host: host,
  dialect: "postgres",
  port: port,
  logging: false,
  dialectModule: pg,
  username: process.env.PG_USER,
  database: process.env.PG_DATABASE,
  pool: {
    max: PG_POOL_SIZE,
    min: 5,
    acquire: 60000,
    idle: 10000,
  },
  hooks: {
    beforeConnect: async (config: any) => {
      const isRds = host.includes("rds.amazonaws.com");

      let password = process.env.PG_PASSWORD;
      if (isRds && !password) {
        const signer = new AWS.RDS.Signer({
          region: process.env.AWS_REGION,
          hostname: process.env.PG_HOST,
          port,
          username: process.env.PG_USER,
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

export class AssetOwner extends Model {
  declare asset: string;
  declare owner: string;
  declare lastBlock: number;
}

AssetOwner.init(
  {
    asset: {
      type: STRING,
      primaryKey: true,
      allowNull: false,
    },
    owner: {
      type: STRING,
      allowNull: false,
    },
    lastBlock: {
      type: INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize: database,
    modelName: "assetOwner",
    tableName: "asset_owners",
    underscored: true,
    timestamps: true,
    indexes: [
      {
        fields: ["asset", "last_block"],
      },
      {
        fields: ["last_block"],
      },
    ],
  }
);

export class Cursor extends Model {
  declare cursor: string;
}

Cursor.init(
  {
    cursor: {
      type: STRING,
    },
    service: {
      type: STRING,
      primaryKey: true,
      unique: true,
    },
    block: {
      type: STRING,
      // mistakenly named the field "block_height" in the database when it actually represents the slot/block height
      // this alias is used to ensure backwards compatibility with the previous name
      field: "block_height",
    },
  },
  {
    sequelize: database,
    modelName: "cursor",
    tableName: "cursors",
    underscored: true,
    timestamps: true,
  }
);

/**
 * Conditional upsert that only writes when the incoming last_block is >= the
 * existing value, preventing stale replays from overwriting newer data.
 */
export async function upsertAssetOwner(
  { asset, owner, lastBlock }: { asset: string; owner: string; lastBlock: number },
  { transaction }: { transaction?: Transaction } = {}
): Promise<void> {
  await database.query(
    `INSERT INTO asset_owners (asset, owner, last_block, created_at, updated_at)
     VALUES (:asset, :owner, :lastBlock, NOW(), NOW())
     ON CONFLICT (asset) DO UPDATE SET
       owner = EXCLUDED.owner,
       last_block = EXCLUDED.last_block,
       updated_at = NOW()
     WHERE asset_owners.last_block <= EXCLUDED.last_block`,
    {
      replacements: { asset, owner, lastBlock },
      type: QueryTypes.INSERT,
      transaction,
    }
  );
}

export async function bulkUpsertAssetOwners(
  rows: { asset: string; owner: string; lastBlock: number }[],
  { transaction }: { transaction?: Transaction } = {}
): Promise<void> {
  if (rows.length === 0) return;

  const bind: unknown[] = [];
  const valueClauses = rows.map((r, i) => {
    const offset = i * 3;
    bind.push(r.asset, r.owner, r.lastBlock);
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, NOW(), NOW())`;
  });

  await database.query(
    `INSERT INTO asset_owners (asset, owner, last_block, created_at, updated_at)
     VALUES ${valueClauses.join(", ")}
     ON CONFLICT (asset) DO UPDATE SET
       owner = EXCLUDED.owner,
       last_block = EXCLUDED.last_block,
       updated_at = NOW()
     WHERE asset_owners.last_block <= EXCLUDED.last_block`,
    {
      bind,
      type: QueryTypes.INSERT,
      transaction,
    }
  );
}

export default database;
