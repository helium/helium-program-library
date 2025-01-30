import * as anchor from "@coral-xyz/anchor";
import {
  lazyDistributorKey
} from "@helium/lazy-distributor-sdk";
import { init as initHsd } from "@helium/helium-sub-daos-sdk";
import { organizationKey } from "@helium/organization-sdk";
import { oracleSignerKey } from "@helium/rewards-oracle-sdk";
import {
  batchParallelInstructionsWithPriorityFee
} from "@helium/spl-utils";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import Squads from "@sqds/sdk";
import fs from "fs";
import os from "os";
import yargs from "yargs/yargs";
import {
  loadKeypair,
  parseEmissionsSchedule,
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
    delegatedPositions: {
      type: "string",
      describe: "Path to the delegated positions file",
      default: __dirname + "/delegatedPositions.txt",
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const hsdProgram = await initHsd(provider);

  const delegatedPositions = fs.readFileSync(argv.delegatedPositions, "utf-8")
    .split("\n")
    .filter(line => line.trim() !== ""); // Remove empty lines

  const instructions: TransactionInstruction[] = [];
  for (const delegatedPosition of delegatedPositions) {
    console.log(delegatedPosition, new PublicKey(delegatedPosition).toBase58());
    instructions.push(
      await hsdProgram.methods
        .tempFixClaimedEpoch()
        .accounts({
          authority: wallet.publicKey,
          delegatedPosition: new PublicKey(delegatedPosition),
        })
        .instruction()
    );
  }
  // await batchParallelInstructionsWithPriorityFee(provider, instructions, {maxSignatureBatch: 100});
}
