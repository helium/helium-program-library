import * as anchor from "@coral-xyz/anchor";
import { toNumber } from "@helium/spl-utils";
import fs from "fs";
import os from "os";
import yargs from "yargs/yargs";

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
    token: {
      type: "string",
      default: "hnt"
    },
    state: {
      type: "string",
      alias: "s",
      default: `${__dirname}/../../migration-service/export.json`,
    },
    decimals: {
      type: "number",
      default: 8
    }
  });

  const argv = await yarg.argv;
  const state = JSON.parse(fs.readFileSync(argv.state).toString());
  const accounts = state.accounts as Record<string, any>;
  const total: anchor.BN = Object.values(accounts).reduce(
    (acc: anchor.BN, v: any) => {
      if (v[argv.token]) {
        return acc.add(new anchor.BN(v[argv.token]));
      }

      return acc;
    },
    new anchor.BN(0)
  );

  console.log(toNumber(total, argv.decimals))
}
