import * as anchor from "@coral-xyz/anchor";
import { batchParallelInstructionsWithPriorityFee } from "@helium/spl-utils";
import fs from "fs";
import { init as initHsd } from "@helium/helium-sub-daos-sdk";
import { init as initVsr, positionKey } from "@helium/voter-stake-registry-sdk";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { AccountFetchCache } from "@helium/account-fetch-cache";

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
    mistakeFile: {
      alias: "m",
      describe: "The mistake file",
      default: "mistake.json",
    },
  });

  const argv = await yarg.argv;
  const mistakes = JSON.parse(fs.readFileSync(argv.mistakeFile, "utf8"));
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  if (argv.resetSubDaoVotingMint && !argv.dntMint) {
    console.log("dnt mint not provided");
    return;
  }

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const cache = new AccountFetchCache({
    connection: provider.connection,
    commitment: "confirmed",
    extendConnection: true,
  });
  const hsdProgram = await initHsd(provider);

  let instructions: TransactionInstruction[] = [];
  let i = 0;
  for (const mistake of mistakes) {
    for (const voteMarker of mistake.vote_markers) {
      console.log(voteMarker);
      instructions.push(
        await hsdProgram.methods
          .trackVoteV0()
          .accounts({
            delegatedPosition: new PublicKey(mistake.delegated_position),
            proposal: new PublicKey(voteMarker.proposal),
            marker: new PublicKey(voteMarker.address),
            position: positionKey(new PublicKey(voteMarker.mint))[0],
          })
          .instruction()
      );
      if (i > 20) {
        await batchParallelInstructionsWithPriorityFee(provider, instructions, {
          onProgress: console.log,
          computeScaleUp: 2,
        });
        i = 0;
        instructions = [];
      }
      i++;
    }
  }
  await batchParallelInstructionsWithPriorityFee(provider, instructions, {
    onProgress: console.log,
  });
}
