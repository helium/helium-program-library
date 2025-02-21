import * as anchor from "@coral-xyz/anchor";
import { cronJobKey, cronJobNameMappingKey, cronJobTransactionKey, init as initCron } from "@helium/cron-sdk";
import { sendInstructionsWithPriorityFee } from "@helium/spl-utils";
import {
  init as initTuktuk,
  taskKey
} from "@helium/tuktuk-sdk";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { HplCrons } from "../../target/types/hpl_crons";

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
    keyToAsset: {
      required: true,
      type: "string",
      describe: "The key to asset to queue",
    },
    fundingAmount: {
      required: true,
      type: "string",
      describe: "The amount of lamports to fund the cron job with",
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const taskQueue = new PublicKey(argv.taskQueue);
  const idl = await anchor.Program.fetchIdl(PROGRAM_ID, provider);
  // @ts-ignore
  idl?.address = PROGRAM_ID.toBase58();
  const program = new anchor.Program<HplCrons>(
    idl as HplCrons,
    provider
  ) as anchor.Program<HplCrons>;
  const cronProgram = await initCron(provider);
  const tuktukProgram = await initTuktuk(provider);
  const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
  const nextAvailable = nextAvailableTaskIds(taskQueueAcc.taskBitmap, 1)[0];
  const [task] = taskKey(taskQueue, nextAvailable);
  const keyToAsset = new PublicKey(argv.keyToAsset);
  const authority = PublicKey.findProgramAddressSync(
    [
      Buffer.from("entity_cron_authority"),
      provider.wallet.publicKey.toBuffer(),
    ],
    PROGRAM_ID
  )[0];
  const cronJob = cronJobKey(authority, 0)[0];
  if (!(await provider.connection.getAccountInfo(cronJob))) {
    await sendInstructionsWithPriorityFee(provider, [
      await program.methods
        .initEntityClaimCronV0({
          schedule: "0 0 2 * * *",
        })
        .accounts({
          taskQueue,
          cronJob,
          task,
          cronJobNameMapping: cronJobNameMappingKey(authority, "entity_claim")[0],
        })
        .instruction(),
      SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: cronJob,
        lamports: BigInt(argv.fundingAmount),
      }),
    ], {
      computeUnitLimit: 500000
    });
  }
  console.log("Cron job account", cronJob.toBase58());
  const cronJobAcc = await cronProgram.account.cronJobV0.fetch(cronJob);
  const instructions: TransactionInstruction[] = [];
  const { instruction } = await program.methods
    .addEntityToCronV0({
      index: cronJobAcc.nextTransactionId,
    })
    .accounts({
      keyToAsset,
      cronJob,
      cronJobTransaction: cronJobTransactionKey(cronJob, cronJobAcc.nextTransactionId)[0],
    })
    .prepare();

  instructions.push(instruction);

  await sendInstructionsWithPriorityFee(provider, instructions, {
    computeUnitLimit: 500000,
  });
}

export function nextAvailableTaskIds(taskBitmap: Buffer, n: number): number[] {
  if (n === 0) {
    return [];
  }

  const availableTaskIds: number[] = [];
  for (let byteIdx = 0; byteIdx < taskBitmap.length; byteIdx++) {
    const byte = taskBitmap[byteIdx];
    if (byte !== 0xff) {
      // If byte is not all 1s
      for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
        if ((byte & (1 << bitIdx)) === 0) {
          availableTaskIds.push(byteIdx * 8 + bitIdx);
          if (availableTaskIds.length === n) {
            return availableTaskIds;
          }
        }
      }
    }
  }
  return availableTaskIds;
}
