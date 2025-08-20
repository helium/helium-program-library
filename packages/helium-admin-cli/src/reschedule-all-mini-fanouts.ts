import * as anchor from "@coral-xyz/anchor";
import { TASK_QUEUE_ID } from "@helium/hpl-crons-sdk";
import { init as initMfan } from "@helium/mini-fanout-sdk";
import { batchInstructionsToTxsWithPriorityFee, bulkSendTransactions, truthy } from "@helium/spl-utils";
import { init as initTuktuk, nextAvailableTaskIds, taskKey } from "@helium/tuktuk-sdk";
import { TransactionInstruction } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair } from "./utils";

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
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const program = await initMfan(provider);
  const tuktukProgram = await initTuktuk(provider);

  const instructions: TransactionInstruction[][] = [];
  const miniFanouts = await program.account.miniFanoutV0.all();
  const batchSize = 10;
  const taskQueue = await tuktukProgram.account.taskQueueV0.fetch(TASK_QUEUE_ID)
  const freeTasks = nextAvailableTaskIds(taskQueue.taskBitmap, miniFanouts.length * 2)
  for (let i = 0; i < miniFanouts.length; i += batchSize) {
    // Log progress every 100 positions
    if (i > 0 && i % 100 === 0) {
      console.log(`Processed ${i} mini fanouts`);
    }

    const batch = miniFanouts.slice(i, i + batchSize);

    await Promise.all(batch.map(async (delegation, j) => {
      const miniFanout = batch[j];
      const nextTask = freeTasks.pop()!;
      const nextPreTask = freeTasks.pop()!;

      const nextTaskAcc = await tuktukProgram.account.taskV0.fetchNullable(miniFanout.account.nextTask)
      const nextPreTaskAcc = await tuktukProgram.account.taskV0.fetchNullable(miniFanout.account.nextPreTask)

      instructions.push([
        nextTaskAcc ? await tuktukProgram.methods.dequeueTaskV0().accounts({
          task: miniFanout.account.nextTask,
        }).instruction() : undefined,
        nextPreTaskAcc ? await tuktukProgram.methods.dequeueTaskV0().accounts({
          task: miniFanout.account.nextPreTask,
        }).instruction() : undefined,
        await program.methods.scheduleTaskV0({
          taskId: nextTask,
          preTaskId: nextPreTask,
        })
          .accounts({
            payer: wallet.publicKey,
            miniFanout: miniFanout.publicKey,
            task: taskKey(TASK_QUEUE_ID, nextTask)[0],
            preTask: taskKey(TASK_QUEUE_ID, nextPreTask)[0],
          })
          .instruction()
      ].filter(truthy));
    }));
  }
  console.log(`Finished processing ${miniFanouts.length} mini fanouts`);

  const transactions = await batchInstructionsToTxsWithPriorityFee(
    provider,
    instructions,
    {
      useFirstEstimateForAll: true,
      computeUnitLimit: 1200000,
    }
  );

  await bulkSendTransactions(provider, transactions, console.log, 10, [], 100);
}
