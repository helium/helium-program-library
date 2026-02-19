import { Model, ModelStatic, STRING, Sequelize, QueryTypes, Transaction } from "sequelize";
import AWS from "aws-sdk";
import * as pg from "pg";
import { PG_POOL_SIZE } from "../env";
import pLimit from "p-limit";

export async function conditionalUpsert(
  sequelize: Sequelize,
  model: ModelStatic<Model>,
  values: Record<string, unknown>,
  options: { transaction?: Transaction } = {}
): Promise<void> {
  return conditionalBulkUpsert(sequelize, model, [values], undefined, options);
}

const BULK_CHUNK_SIZE = 5000;

export async function conditionalBulkUpsert(
  sequelize: Sequelize,
  model: ModelStatic<Model>,
  records: Record<string, unknown>[],
  updateColumns?: string[],
  options: { transaction?: Transaction } = {}
): Promise<void> {
  if (records.length === 0) return;

  const rawTableName = model.getTableName();
  let fullTableName: string;
  let shortTableName: string;
  if (typeof rawTableName === "string") {
    fullTableName = `"${rawTableName}"`;
    shortTableName = fullTableName;
  } else {
    const schema = (rawTableName as any).schema || "public";
    const table = (rawTableName as any).tableName;
    fullTableName = `"${schema}"."${table}"`;
    shortTableName = `"${table}"`;
  }

  const attrs = model.getAttributes();
  const mappings = Object.entries(attrs).map(([attribute, meta]) => {
    const typeKey = (meta as any).type?.key;
    return {
      attribute,
      dbColumn: (meta as any).field || attribute,
      isPrimaryKey: !!(meta as any).primaryKey,
      isJson: typeKey === "JSON" || typeKey === "JSONB",
    };
  });

  const pkColumns = mappings.filter((m) => m.isPrimaryKey);
  const firstRecord = records[0];
  const presentMappings = mappings.filter((m) => m.attribute in firstRecord);

  const timestampColumns: { dbColumn: string; insertOnly: boolean }[] = [];
  if ("createdAt" in attrs && !("createdAt" in firstRecord)) {
    timestampColumns.push({
      dbColumn: (attrs.createdAt as any).field || "createdAt",
      insertOnly: true,
    });
  }
  if ("updatedAt" in attrs && !("updatedAt" in firstRecord)) {
    timestampColumns.push({
      dbColumn: (attrs.updatedAt as any).field || "updatedAt",
      insertOnly: false,
    });
  }

  const q = (id: string) => `"${id}"`;
  const columns = [
    ...presentMappings.map((m) => q(m.dbColumn)),
    ...timestampColumns.map((ts) => q(ts.dbColumn)),
  ];
  const conflictCols = pkColumns.map((m) => q(m.dbColumn)).join(", ");

  const updateMappings = updateColumns
    ? presentMappings.filter((m) => !m.isPrimaryKey && updateColumns.includes(m.attribute))
    : presentMappings.filter((m) => !m.isPrimaryKey);
  const setClauses = [
    ...updateMappings.map(
      (m) => `${q(m.dbColumn)} = EXCLUDED.${q(m.dbColumn)}`
    ),
    ...timestampColumns
      .filter((ts) => !ts.insertOnly)
      .map((ts) => `${q(ts.dbColumn)} = NOW()`),
  ];

  for (let offset = 0; offset < records.length; offset += BULK_CHUNK_SIZE) {
    const chunk = records.slice(offset, offset + BULK_CHUNK_SIZE);
    const bind: unknown[] = [];
    const valueClauses = chunk.map((record) => {
      const rowPlaceholders = [
        ...presentMappings.map((m) => {
          const val = record[m.attribute];
          bind.push(m.isJson && val != null ? JSON.stringify(val) : val);
          return `$${bind.length}`;
        }),
        ...timestampColumns.map(() => "NOW()"),
      ];
      return `(${rowPlaceholders.join(", ")})`;
    });

    const sql = [
      `INSERT INTO ${fullTableName} (${columns.join(", ")})`,
      `VALUES ${valueClauses.join(", ")}`,
      `ON CONFLICT (${conflictCols}) DO UPDATE SET ${setClauses.join(", ")}`,
      `WHERE ${shortTableName}."last_block" <= EXCLUDED."last_block"`,
    ].join("\n");

    await sequelize.query(sql, {
      bind,
      type: QueryTypes.INSERT,
      transaction: options.transaction,
    });
  }
}

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
    acquire: 120000,
    idle: 30000,
  },
  dialectOptions: {
    statement_timeout: 300000,
    idle_in_transaction_session_timeout: 300000,
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
          statement_timeout: 300000,
          idle_in_transaction_session_timeout: 300000,
        };
      }
      config.password = password;
    },
  },
});

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

export default database;
