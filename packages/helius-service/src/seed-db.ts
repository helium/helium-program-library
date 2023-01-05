import { sequelize, Hotspot } from './model';
import yargs from "yargs/yargs";
import fs from 'fs';
const { hideBin } = require("yargs/helpers");

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

  await sequelize.sync();
  const state = JSON.parse(fs.readFileSync(argv.state).toString());
  const hotspots = Object.entries(state.hotspots) as [string, any][];

  const records = hotspots.map((hotspot) => {
    return {
      asset: '',
      hotspot_key: hotspot[0],
      location: hotspot[1].location,
      elevation: hotspot[1].altitude,
      gain: hotspot[1].gain,
    }
  })
  console.log(records);
  const chunkSize = 100;
  for (let i = 0; i < records.length; i+= chunkSize) {
    console.log("chunk", i);
    // update db in chunks of 100
    await Hotspot.bulkCreate(records.slice(i, i + chunkSize));
  }
  
  
 
}

start();