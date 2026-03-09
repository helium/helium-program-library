import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  bulkSendRawTransactions,
  populateMissingDraftInfo,
  toVersionedTx,
  withPriorityFees,
} from "@helium/spl-utils";
// @ts-ignore
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk";
import { runTask, taskKey } from "@helium/tuktuk-sdk";
import {
  Keypair,
  PublicKey,
  sendAndConfirmRawTransaction,
} from "@solana/web3.js";

export async function runAllTasks(
  provider: anchor.AnchorProvider,
  tuktukProgram: Program<Tuktuk>,
  taskQueue: PublicKey,
  crankTurner: Keypair,
  taskIds?: number[],
  nextAvailableTaskIds?: number[]
) {
  const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(taskQueue);

  // Find all task IDs that need to be executed (have a 1 in the bitmap)
  taskIds = taskIds || [];
  if (taskIds.length == 0) {
    for (let i = 0; i < taskQueueAcc.taskBitmap.length; i++) {
      const byte = taskQueueAcc.taskBitmap[i];
      for (let bit = 0; bit < 8; bit++) {
        if ((byte & (1 << bit)) !== 0) {
          taskIds.push(i * 8 + bit);
        }
      }
    }
  }

  // Execute all tasks
  for (const taskId of taskIds) {
    const task = taskKey(taskQueue, taskId)[0];
    const taskAcc = await tuktukProgram.account.taskV0.fetchNullable(task);
    if (!taskAcc) {
      continue;
    }
    if (
      (taskAcc.trigger.timestamp?.[0]?.toNumber() || 0) <
        new Date().getTime() / 1000 &&
      typeof taskAcc.trigger.now === "undefined"
    ) {
      continue;
    }

    const runTaskIxs = await runTask({
      program: tuktukProgram,
      task,
      crankTurner: crankTurner.publicKey,
      nextAvailableTaskIds,
    });
    const draftIxs = await withPriorityFees({
      connection: provider.connection,
      instructions: runTaskIxs,
      signers: [crankTurner],
      addressLookupTableAddresses: taskQueueAcc.lookupTables,
      feePayer: crankTurner.publicKey,
    });
    const tx = toVersionedTx(
      await populateMissingDraftInfo(provider.connection, {
        instructions: draftIxs,
        feePayer: crankTurner.publicKey,
        signers: [crankTurner],
        addressLookupTableAddresses: taskQueueAcc.lookupTables,
      }, "finalized")
    );
    await tx.sign([crankTurner]);
    console.log(
      await sendAndConfirmRawTransaction(
        provider.connection,
        Buffer.from(tx.serialize()),
        { skipPreflight: false }
      )
    );
  }
}
