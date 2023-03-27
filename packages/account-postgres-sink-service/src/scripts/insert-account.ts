import * as anchor from "@coral-xyz/anchor";
import { GetProgramAccountsFilter, PublicKey } from "@solana/web3.js";
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
    required: false,
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
  let individualAcc = null;
  let accs: { publicKey: PublicKey; account: any }[] = [];

  if (argv.address) {
    console.log(`fetching individual ${argv.account}`);
    individualAcc = await program.account[
      camelize(argv.account, true)
    ].fetchNullable(argv.address);

    if (!individualAcc) {
      console.log(`unable to fetch ${argv.account}`);
      return;
    }
  }

  if (!argv.address) {
    console.log(`fetching all ${argv.account}s`);
    const filter: { offset?: number; bytes?: string; dataSize?: number } =
      program.coder.accounts.memcmp(argv.account, undefined);
    const coderFilters: GetProgramAccountsFilter[] = [];

    if (filter?.offset != undefined && filter?.bytes != undefined) {
      coderFilters.push({
        memcmp: { offset: filter.offset, bytes: filter.bytes },
      });
    }

    if (filter?.dataSize != undefined) {
      coderFilters.push({ dataSize: filter.dataSize });
    }

    let resp = await provider.connection.getProgramAccounts(programId, {
      commitment: provider.connection.commitment,
      filters: [...coderFilters],
    });

    accs = resp
      .map(({ pubkey, account }) => {
        // ignore accounts we cant decode
        try {
          return {
            publicKey: pubkey,
            account: program.coder.accounts.decode(argv.account, account.data),
          };
        } catch (_e) {
          return null;
        }
      })
      .filter(Boolean);

    if (!accs.length) {
      console.log(`unable to fetch ${argv.account}s`);
      return;
    }
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

  await defineIdlModels({ idl, sequelize });
  const model = sequelize.models[argv.account];
  await model.sync({ alter: true });
  console.log("attempting to populate database");

  if (individualAcc) {
    await model.upsert({
      address: argv.address,
      ...sanitizeAccount(individualAcc),
    });
  }

  if (accs.length) {
    await model.bulkCreate(
      accs.map(({ publicKey, account }) => ({
        address: publicKey.toBase58(),
        ...sanitizeAccount(account),
      })),
      { updateOnDuplicate: ["address"] }
    );
  }

  console.log(
    `successfully populated database with ${
      individualAcc ? 1 : accs.length
    } records...`
  );
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
