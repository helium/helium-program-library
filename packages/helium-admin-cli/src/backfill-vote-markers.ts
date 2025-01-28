import AWS from "aws-sdk";
import fs from "fs";
import * as pg from "pg";
import {
  ARRAY,
  BOOLEAN,
  DECIMAL,
  INTEGER,
  Model,
  STRING,
  Sequelize,
} from "sequelize";
import yargs from "yargs/yargs";

export async function run(args: any = process.argv) {
  const yarg = yargs(args).options({
    outputPath: {
      type: "string",
      describe: "The path to the output file",
      default: "vote-markers.json",
    },
    pgUser: {
      default: "postgres",
    },
    pgPassword: {
      type: "string",
    },
    pgDatabase: {
      type: "string",
    },
    pgHost: {
      default: "localhost",
    },
    pgPort: {
      default: "5432",
    },
    awsRegion: {
      default: "us-east-1",
    },
    noSsl: {
      type: "boolean",
      default: false,
    },
    voteMarkerJson: {
      type: "string",
      describe: "The path to the vote marker json file",
      required: true,
    },
  });
  const argv = await yarg.argv;

  const voteMarkers = JSON.parse(fs.readFileSync(argv.voteMarkerJson, "utf8"));

  const host = argv.pgHost;
  const port = Number(argv.pgPort);
  const database = new Sequelize({
    host,
    dialect: "postgres",
    port,
    logging: false,
    dialectModule: pg,
    username: argv.pgUser,
    database: argv.pgDatabase,
    pool: {
      max: 10,
      min: 5,
      acquire: 60000,
      idle: 10000,
      validate: (client: any) => {
        try {
          client.query("SELECT 1");
          return true;
        } catch (err) {
          return false;
        }
      },
    },
    hooks: {
      beforeConnect: async (config: any) => {
        const isRds = host.includes("rds.amazonaws.com");

        let password = argv.pgPassword;
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

  class VoteMarker extends Model {
    declare address: string;
    declare pubkey: string;
    declare voter: string;
    declare registrar: string;
    declare proposal: string;
    declare mint: string;
    declare choices: number[];
    declare weight: string;
    declare bumpSeed: number;
    declare deprecatedRelinquished: boolean;
    declare proxyIndex: number;
    declare rentRefund: string;
  }

  VoteMarker.init(
    {
      address: {
        type: STRING,
        primaryKey: true,
      },
      voter: {
        type: STRING,
        primaryKey: true,
      },
      registrar: {
        type: STRING,
        primaryKey: true,
      },
      proposal: {
        type: STRING,
        primaryKey: true,
      },
      mint: {
        type: STRING,
        primaryKey: true,
      },
      choices: {
        type: ARRAY(INTEGER),
      },
      weight: {
        type: DECIMAL.UNSIGNED,
      },
      bumpSeed: {
        type: INTEGER,
      },
      deprecatedRelinquished: {
        type: BOOLEAN,
      },
      proxyIndex: {
        type: INTEGER,
      },
      rentRefund: {
        type: STRING,
      },
    },
    {
      sequelize: database,
      modelName: "vote_marker",
      tableName: "vote_markers",
      underscored: true,
      updatedAt: false,
    }
  );

  await VoteMarker.bulkCreate(voteMarkers, {
    ignoreDuplicates: true, // ON CONFLICT DO NOTHING
  });
}
