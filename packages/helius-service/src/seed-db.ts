import { sequelize, Entity, IotMetadata, MobileMetadata } from './model';
import yargs from "yargs/yargs";
import fs from 'fs';
import Address from '@helium/address/build/Address';
import { ED25519_KEY_TYPE } from '@helium/address/build/KeyTypes';
import * as anchor from "@coral-xyz/anchor";
const { hideBin } = require("yargs/helpers");

function printProgress(prefix: string, progress: number){
  process.stdout.cursorTo(0);
  process.stdout.write(prefix + progress + '%');
}

async function start() {
  const yarg = yargs(hideBin(process.argv)).options({
    state: {
      alias: "f",
      required: true,
      type: "string",
      describe: "The path to a Helium state export file",
    },
  });
  const argv = await yarg.argv;

  anchor.setProvider(anchor.AnchorProvider.local());

  const provider = anchor.getProvider() as anchor.AnchorProvider;

  await sequelize.sync();
  const state = JSON.parse(fs.readFileSync(argv.state).toString());
  const hotspots = Object.entries(state.hotspots) as [string, any][];

  const bobcat5G = "14gqqPV2HEs4PCNNUacKVG7XeAhCUkN553NcBVw4xfwSFcCjhXv";
  const freedomFi = "13y2EqUUzyQhQGtDSoXktz8m5jHNSiwAKLTYnHNxZq2uH5GGGym";

  const solAddr = provider.wallet.publicKey; // TODO change this to a constant keypair so it matches gen-transactions
  const helAddr = new Address(0, 0, ED25519_KEY_TYPE, solAddr.toBuffer());
  const entities = [];
  const iots = [];
  const mobiles = [];
  for (const hotspot of hotspots) {
    const makerId = hotspot[1].maker || helAddr.b58; // Default (fallthrough) maker
    entities.push({
      hotspotKey: hotspot[0],
      asset: null,
      maker: makerId,
    });
    iots.push({
      hotspotKey: hotspot[0],
      asset: null,
      location: hotspot[1].location,
      elevation: hotspot[1].altitude,
      gain: hotspot[1].gain,
      isFullHotspot: !hotspot[1].dataonly
    })
    if (makerId == bobcat5G || makerId == freedomFi) {
      mobiles.push({
        hotspotKey: hotspot[0],
        location: hotspot[1].location,
        isFullHotspot: !hotspot[1].dataonly
      })
    }
  }

  // commit to db in chunks
  const chunkSize = 100;
  for (let i = 0; i < entities.length; i+= chunkSize) {
    printProgress("Iot db progress: ", Math.round(i*100 / entities.length));
    await Entity.bulkCreate(entities.slice(i, Math.min(entities.length, i+chunkSize)));
    await IotMetadata.bulkCreate(iots.slice(i, Math.min(iots.length, i+chunkSize)));
  }
  console.log("\nfinished writing entities and iot")
  for (let i = 0; i < mobiles.length; i+= chunkSize) {
    printProgress("Mobile db progress: ", Math.round(i*100 / mobiles.length));
    await MobileMetadata.bulkCreate(mobiles.slice(i, Math.min(mobiles.length, i+chunkSize)));
  }
  console.log("");
}

start();