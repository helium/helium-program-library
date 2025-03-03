import * as anchor from "@coral-xyz/anchor";
import {
  daoKey,
  init as initDao,
  subDaoKey,
} from "@helium/helium-sub-daos-sdk";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import Squads from "@sqds/sdk";
import os from "os";
import yargs from "yargs/yargs";
import {
  getTimestampFromDays,
  getUnixTimestamp,
  loadKeypair,
  sendInstructionsOrSquads,
} from "./utils";

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
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  if (argv.resetSubDaoVotingMint && !argv.dntMint) {
    console.log("dnt mint not provided");
    return;
  }

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const hvsrProgram = await initVsr(provider);
  const markers = await hvsrProgram.account.voteMarkerV0.all();
  const instructions: TransactionInstruction[] = [];

}
