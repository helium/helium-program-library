#!/usr/bin/env node

const { hideBin } = require("yargs/helpers");
const path = require("path");
const args = hideBin(process.argv);
const script = args[0];

const correctPath = path.join(__dirname, "..", "lib", "cjs", `${script}`);

require(correctPath)
  .run(args.filter((arg) => arg !== script))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
