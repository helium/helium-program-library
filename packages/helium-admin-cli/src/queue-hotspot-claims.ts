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
import {
  init as initHplCrons,
  entityCronAuthorityKey,
  nextAvailableTaskIds,
} from "@helium/hpl-crons-sdk";

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
  const program = await initHplCrons(provider);
  const cronProgram = await initCron(provider);
  const tuktukProgram = await initTuktuk(provider);
  const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
  const nextAvailable = nextAvailableTaskIds(taskQueueAcc.taskBitmap, 1)[0];
  const [task] = taskKey(taskQueue, nextAvailable);
  const keyToAsset = new PublicKey(argv.keyToAsset);
  const authority = entityCronAuthorityKey(provider.wallet.publicKey)[0];
  const cronJob = cronJobKey(authority, 0)[0];
  if (!(await provider.connection.getAccountInfo(cronJob))) {
    await sendInstructionsWithPriorityFee(provider, [
      await program.methods
        .initEntityClaimCronV0({
          schedule: "0 0 2 * * *",
        })
        .accountsPartial({
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
    .accountsPartial({
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
