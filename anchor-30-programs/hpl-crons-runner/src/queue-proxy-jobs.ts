import * as anchor from "@coral-xyz/anchor";
import { sendInstructionsWithPriorityFee } from "@helium/spl-utils";
import {
  customSignerKey,
  init as initTuktuk,
  taskKey,
} from "@helium/tuktuk-sdk";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import {
  PublicKey,
  TransactionInstruction
} from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { HplCrons } from "../../target/types/hpl_crons";
import { nextAvailableTaskIds } from "./queue-hotspot-claims";

const PROGRAM_ID = new PublicKey("hcrLPFgFUY6sCUKzqLWxXx5bntDiDCrAZVcrXfx9AHu");

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
    taskQueue: {
      required: true,
      type: "string",
      alias: "t",
      describe: "The task queue to queue",
      default: "H39gEszvsi6AT4rYBiJTuZHJSF5hMHy6CKGTd7wzhsg7",
    },
    position: {
      required: true,
      type: "string",
      describe: "The position to trigger automated claims for",
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const taskQueue = new PublicKey(argv.taskQueue);
  const idl = await anchor.Program.fetchIdl(PROGRAM_ID, provider);
  const program = new anchor.Program<HplCrons>(
    idl as HplCrons,
    provider
  ) as anchor.Program<HplCrons>;
  const vsrProgram = await initVsr(provider);
  const tuktukProgram = await initTuktuk(provider);
  const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
  const nextAvailable = nextAvailableTaskIds(taskQueueAcc.taskBitmap, 2);
  const proxyMarkers = await vsrProgram.account.proxyMarkerV0.all();
  const instructions: TransactionInstruction[] = [];
  for (const marker of proxyMarkers) {
    instructions.push(
      await program.methods
        .queueProxyVoteV0({
          freeTaskIds: nextAvailable,
        })
        .accounts({
          marker: marker.publicKey,
          task_1: taskKey(taskQueue, nextAvailable[0])[0],
          task_2: taskKey(taskQueue, nextAvailable[1])[0],
        })
        .instruction()
    );
  }

  await sendInstructionsWithPriorityFee(provider, instructions, {
    computeUnitLimit: 500000,
  });
}
