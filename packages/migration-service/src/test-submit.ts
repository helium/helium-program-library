import { lazySignerKey } from "@helium/lazy-transactions-sdk";
import * as anchor from "@project-serum/anchor";
import axios from "axios";
import os from "os";
import yargs from "yargs/yargs";

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
  migrateUrl: {
    alias: "m",
    default: "http://127.0.0.1:8081",
    describe: "The migration service url",
  },
  targetWallet: {
    alias: "t",
    type: "string"
  }
});

async function run() {
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const txs = (await axios.get(`${argv.migrateUrl}/migrate/${argv.targetWallet}`)).data.transactions;
  const txids = await Promise.all(txs.map(async tx => await provider.connection.sendRawTransaction(
    Buffer.from(tx),
    {
      skipPreflight: true
    }
  )));
  console.log("Sending", txids);
  await Promise.all(txids.map(async txid => {
    await provider.connection.confirmTransaction(txid, "processed");
  }));
  console.log("done");
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
