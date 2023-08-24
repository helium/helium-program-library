import * as anchor from "@coral-xyz/anchor";
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
  const success = await Promise.all(txids.map(async txid => {
    const tx = await provider.connection.confirmTransaction(txid, "processed");
    if(tx.value.err) {
      const tx = await provider.connection.getTransaction(txid);
      console.error(txid, tx!.meta!.logMessages?.join("\n"));
    }
    return !tx.value.err
  }));


  console.log("done", success.filter(s => !s).length, "failed", success.filter(s => s).length, "succeeded");
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
