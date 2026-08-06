import * as anchor from "@coral-xyz/anchor";
import { TASK_QUEUE_ID } from "@helium/hpl-crons-sdk";
import { init as initMfan } from "@helium/mini-fanout-sdk";
import { batchInstructionsToTxsWithPriorityFee, bulkSendTransactions } from "@helium/spl-utils";
import { init as initTuktuk, nextAvailableTaskIds, taskKey } from "@helium/tuktuk-sdk";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
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
    miniFanout: {
      type: "string",
      describe:
        "Reschedule only this mini fanout instead of every mini fanout on the network. Use this to recover a single fanout (e.g. the council fanout) that went idle after running out of lamports, without touching anyone else's.",
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
  const allMiniFanouts = await program.account.miniFanoutV0.all();
  const miniFanouts = argv.miniFanout
    ? allMiniFanouts.filter((mf) =>
        mf.publicKey.equals(new PublicKey(argv.miniFanout!))
      )
    : allMiniFanouts;
  if (argv.miniFanout && miniFanouts.length === 0) {
    throw new Error(`No mini fanout found at ${argv.miniFanout}`);
  }
  // scheduleTaskV0 only accepts a fanout whose next_task/next_pre_task are
  // already the "nothing scheduled" sentinel (pointing at the fanout itself,
  // or legacy: at the program id) -- see its on-chain constraint. Anything
  // else means a task is genuinely still live, and dequeuing a live task
  // requires a CPI signature from the mini-fanout program's own
  // queue_authority PDA (see queue_authority_seeds! in state.rs), which only
  // update_mini_fanout_v0 / close_mini_fanout_v0 can produce -- both of which
  // require the owner (governance multisig) to sign. There is no way to
  // dequeue a live task from a bare client instruction, so don't try; skip
  // and say so instead of submitting a transaction guaranteed to fail on a
  // missing signature.
  const isIdleSentinel = (miniFanout: (typeof allMiniFanouts)[number], task: PublicKey) =>
    task.equals(program.programId) || task.equals(miniFanout.publicKey);
  const idle = miniFanouts.filter((mf) => {
    const ok =
      isIdleSentinel(mf, mf.account.nextTask) &&
      isIdleSentinel(mf, mf.account.nextPreTask);
    if (!ok) {
      console.log(
        `Skipping ${mf.publicKey.toBase58()}: still has a live scheduled task; ` +
          `use update-council-fanout.ts (owner-signed) to reschedule it instead.`
      );
    }
    return ok;
  });

  const batchSize = 10;
  const taskQueue = await tuktukProgram.account.taskQueueV0.fetch(TASK_QUEUE_ID)
  const freeTasks = nextAvailableTaskIds(taskQueue.taskBitmap, idle.length * 2)
  for (let i = 0; i < idle.length; i += batchSize) {
    // Log progress every 100 positions
    if (i > 0 && i % 100 === 0) {
      console.log(`Processed ${i} mini fanouts`);
    }

    const batch = idle.slice(i, i + batchSize);

    await Promise.all(batch.map(async (miniFanout) => {
      const nextTask = freeTasks.pop()!;
      const nextPreTask = freeTasks.pop()!;

      instructions.push([
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
      ]);
    }));
  }
  console.log(
    `Finished processing ${idle.length} mini fanouts (${
      miniFanouts.length - idle.length
    } skipped as not idle)`
  );

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
