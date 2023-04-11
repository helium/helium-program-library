import yargs from "yargs/yargs";
import { Keypair } from "@helium/crypto";
import fs from "fs";

const { hideBin } = require("yargs/helpers");
const yarg = yargs(hideBin(process.argv)).options({
  state: {
    type: "string",
    alias: "s",
    default: "./export.json",
  },
  output: {
    type: "string",
    alias: "o",
    default: "./rerolled-export.json",
  },
  mapOutput :{
    type: "string",
    required: true,
    describe: "The output location of the map of old addresses to new addresses"
  }
});

// Simple utility to mangle an export so it doesn't conflict with any existing state.
async function run() {
  const argv = await yarg.argv;
  let state = JSON.parse(fs.readFileSync(argv.state).toString());
  let accounts = state.accounts as Record<string, any>;
  let validators = Object.entries(state.validators) as [string, any][];
  let hotspots = Object.entries(state.hotspots) as [string, any][];

  const addrMap = {};
  state.accounts = {};
  for (let [addr, account] of Object.entries(accounts)) {
    const newKey = await Keypair.makeRandom();
    addrMap[addr] = newKey.address.b58
    state.accounts[newKey.address.b58] = account;
  }

  for (let [address, hotspot] of hotspots) {
    state.hotspots[address].owner = addrMap[hotspot.owner];
  }

  for (let [address, validator] of validators) {
    state.validators[address].owner = addrMap[validator.owner];
  }

  fs.writeFileSync(argv.mapOutput, JSON.stringify(addrMap));
  fs.writeFileSync(argv.output, JSON.stringify(state));
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
