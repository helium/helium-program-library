import * as anchor from "@coral-xyz/anchor";
import {
  init as initHsd
} from "@helium/helium-sub-daos-sdk";
import os from "os";
import yargs from "yargs/yargs";

export const run = async (args: any = process.argv) => {
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
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  if (!argv.mint) {
    console.log("mint not provided");
    return;
  }

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const hsdProgram = await initHsd(provider);

  const things = await hsdProgram.account.subDaoEpochInfoV0.all();
  for (const thing of things) {
    hsdProgram.methods.repairSubDaoEpochInfoV0()
    .accounts({
      subDaoEpochInfo: thing.publicKey,
    })
    .rpc({ skipPreflight: true })
  }
};
