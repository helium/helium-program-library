import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import * as pg from "pg";
import { Sequelize } from "sequelize";
import { camelize } from "inflection";
import { defineIdlModels } from "./utils/defineIdlModels";
import { sanitizeAccount } from "./utils/santizeAccount";

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
    alias: "p",
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
    required: true,
  },
  dbUrl: {
    type: "string",
    describe: "Url for connecting to database",
    required: true,
  },
});

async function run() {
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const programId = new PublicKey(argv.programId);
  const idl = await anchor.Program.fetchIdl(programId, provider);

  if (!idl) {
    console.log("unable to fetch idl");
    return;
  }

  if (!idl.accounts.some(({ name }) => name === argv.account)) {
    console.log("account not found on idl");
    return;
  }

  const program = new anchor.Program(idl, programId, provider);
  const acc = await program.account[camelize(argv.account, true)].fetchNullable(
    argv.address
  );

  if (!acc) {
    console.log("uanble to fetch account");
    return;
  }

  console.log("setting up database connection");
  const sequelize = new Sequelize(argv.dbUrl, {
    dialect: "postgres",
    logging: false,
    dialectModule: pg,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  });

  await sequelize.authenticate();
  console.log("connection has been established successfully.");

  const { accounts, types } = idl;
  console.log(JSON.stringify(accounts));
  console.log(JSON.stringify(types));
  // await defineIdlModels({ idl, sequelize });
  // const model = sequelize.models[argv.account];
  // await model.sync({ alter: true });

  // console.log("attempting to populate database");
  // await model.upsert({
  //   address: argv.address,
  //   ...sanitizeAccount(acc),
  // });
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
