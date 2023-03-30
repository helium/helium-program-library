import { PublicKey } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import * as pg from "pg";
import AWS from "aws-sdk";
import { Sequelize } from "sequelize";
import { upsertProgramAccounts } from "../utils/upsertProgramAccounts";

const { hideBin } = require("yargs/helpers");
const yarg = yargs(hideBin(process.argv)).options({
  wallet: {
    alias: "k",
    describe: "Anchor wallet keypair",
    default: `${os.homedir()}/.config/solana/id.json`,
  },
  url: {
    alias: "u",
    default: "http://127.0.0.1:8899",
    describe: "The solana url",
  },
  programId: {
    type: "string",
    describe: "Program Id",
    requried: true,
  },
  account: {
    type: "string",
    describe: "Name of the idl account ie. PositionV0",
    required: true,
  },
  address: {
    type: "string",
    describe: "Address of the account",
    required: false,
  },
  awsRegion: {
    type: "string",
    required: false,
  },
  pgHost: {
    type: "string",
    default: "localhost",
  },
  pgPort: {
    type: "number",
    default: 5432,
  },
  pgDatabase: {
    type: "string",
    required: true,
  },
  pgUser: {
    type: "string",
    default: "postgres",
  },
  pgPassword: {
    type: "string",
    required: true,
  },
  pgTable: {
    type: "string",
    required: false,
  },
  pgSchema: {
    type: "string",
    required: false,
  },
});

async function run() {
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  process.env.AWS_REGION = argv.awsRegion;
  const programId = new PublicKey(argv.programId);

  console.log("setting up database connection");
  const sequelize = new Sequelize({
    host: argv.pgHost,
    dialect: "postgres",
    port: argv.pgPort,
    logging: false,
    dialectModule: pg,
    username: argv.pgUser,
    database: argv.pgDatabase,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    hooks: {
      beforeConnect: async (config: any) => {
        const isRds = argv.pgHost.includes("rds.amazonaws.com");

        let password = argv.pgPassword;
        if (isRds && !password) {
          if (!process.env.AWS_REGION) {
            console.log("no awsRegion provided");
            return;
          }

          const signer = new AWS.RDS.Signer({
            region: process.env.AWS_REGION,
            hostname: argv.pgHost,
            port: argv.pgPort,
            username: argv.pgUser,
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

  await upsertProgramAccounts({
    programId,
    accounts: [
      {
        type: argv.account,
        ...(argv.pgTable ? { table: argv.pgTable } : {}),
        ...(argv.pgSchema ? { schema: argv.pgSchema } : {}),
      },
    ],
    accountAddress: argv.address ? new PublicKey(argv.address) : null,
    sequelize,
  });
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
