import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { createSwitchboardAggregator } from "./utils";
import { loadKeypair } from "./utils";

export async function run(args: any = process.argv) {
  const yarg = yargs(args).options({
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
    executeTransaction: {
      type: "boolean",
    },
    aggregatorKeypair: {
      type: "string",
      describe: "Keypair of the aggregtor",
    },
    activeDeviceOracleUrl: {
      alias: "ao",
      type: "string",
      describe: "The active device oracle URL",
      default: "http://localhost:8081",
    },
    queue: {
      type: "string",
      describe: "Switchbaord oracle queue",
      default: "F8ce7MsckeZAbAGmxjJNetxYXQa9mKr9nnrC3qKubyYy",
    },
    crank: {
      type: "string",
      describe: "Switchboard crank",
      default: "GN9jjCy2THzZxhYqZETmPM3my8vg4R5JyNkgULddUMa5",
    },
    switchboardNetwork: {
      type: "string",
      describe: "The switchboard network",
      default: "devnet",
    },
    authority: {
      type: "string",
    },
  });
  const argv = await yarg.argv;
  console.log(argv.url);
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;

  const wallet = loadKeypair(argv.wallet);
  const aggKeypair = await loadKeypair(argv.aggregatorKeypair);

  console.log("Initializing switchboard oracle");
  await createSwitchboardAggregator({
    crank: new PublicKey(argv.crank),
    queue: new PublicKey(argv.queue),
    wallet,
    provider,
    aggKeypair,
    url: argv.activeDeviceOracleUrl,
    switchboardNetwork: argv.switchboardNetwork,
    authority: argv.authority ? new PublicKey(argv.authority) : wallet.publicKey,
  });
}
