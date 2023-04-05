#!/usr/bin/env node

const { hideBin } = require("yargs/helpers");

const args = hideBin(process.argv);
const script = args[0];
require(__dirname + `/../lib/cjs/${script}`)
  .run(args.filter((arg) => arg !== script))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
