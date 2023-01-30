import {
  daoKey,
  init as initDao, subDaoKey
} from "@helium/helium-sub-daos-sdk";
import {
  init as initLazy
} from "@helium/lazy-distributor-sdk";
import * as anchor from "@coral-xyz/anchor";
import { ComputeBudgetProgram, PublicKey } from "@solana/web3.js";
import axios from "axios";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair } from "./utils";

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
  hntMint: {
    type: "string",
    describe: "Mint of the HNT token. Only used if --resetDaoThread flag is set",
  },
  dntMint: {
    type: "string",
    describe: "Mint of the subdao token. Only used if --resetSubDaoThread flag is set",
  },
  resetDaoThread: {
    type: "boolean",
    describe: "Reset the dao clockwork thread",
    default: false,
  },
  resetSubDaoThread: {
    type: "boolean",
    describe: "Reset the subdao clockwork thread",
    default: false,
  }
});

async function run() {
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  if (argv.resetSubDaoThread && !argv.dntMint) {
    console.log("dnt mint not provided");
    return;
  }
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const hsdProgram = await initDao(provider);
  if (argv.resetDaoThread) {
    console.log("resetting dao thread")
    const hntMint = new PublicKey(argv.hntMint);
    const dao = daoKey(hntMint)[0];

    await hsdProgram.methods.resetDaoThreadV0().accounts({
      dao,
    }).rpc({ skipPreflight: true });
  }

  if (argv.resetSubDaoThread) {
    console.log("resetting subdao thread");
    const dntMint = new PublicKey(argv.dntMint);
    const subDao = subDaoKey(dntMint)[0];

    await hsdProgram.methods.resetSubDaoThreadV0().accounts({
      subDao,
    }).rpc({ skipPreflight: true });
  }
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
