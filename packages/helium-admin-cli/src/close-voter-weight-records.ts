import * as anchor from "@coral-xyz/anchor";
import {
  batchParallelInstructionsWithPriorityFee,
  chunks
} from "@helium/spl-utils";
import { init as initVsr, positionKey } from "@helium/voter-stake-registry-sdk";
import {
  TransactionInstruction
} from "@solana/web3.js";
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
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const vsrProgram = await initVsr(provider);
  const nftVoteRecords = await vsrProgram.account.nftVoteRecord.all();
  const instructions: TransactionInstruction[] = [];
  for (const chunk of chunks(nftVoteRecords, 10)) {
    instructions.push(
      ...(await Promise.all(
        chunk.map((nftVoteRecord) => {
          return vsrProgram.methods
            .adminCloseNftVoteRecord()
            .accounts({
              position: positionKey(nftVoteRecord.account.nftMint)[0],
              voteRecord: nftVoteRecord.publicKey,
              governingTokenOwner: nftVoteRecord.account.governingTokenOwner,
            })
            .instruction();
        })
      ))
    );
  }

  batchParallelInstructionsWithPriorityFee(provider, instructions, {
    onProgress: (status) => {
      console.log(
        `Sending ${status.currentBatchProgress} / ${status.currentBatchSize} batch. ${status.totalProgress} / ${status.totalTxs}`
      );
    },
  });
  console.log("Done");
}
