import { Program } from "@anchor-lang/core";
import { MiniFanout } from "@helium/idls/lib/types/mini_fanout";
import { taskKey, nextAvailableTaskIds } from "@helium/tuktuk-sdk";
import { AccountMeta, PublicKey } from "@solana/web3.js";

// Shared helpers for admin scripts that create, update, reschedule, or close a
// mini-fanout (see create-council-fanout.ts, update-council-fanout.ts,
// close-council-fanout.ts). Kept separate from utils.ts because these only
// make sense in the context of the mini-fanout program's task-queue plumbing.

/**
 * Allocate a fresh (task, preTask) id/pubkey pair from the given tuktuk task
 * queue, for scheduling a mini-fanout's next distribution.
 */
export async function allocateNextTasks(
  tuktukProgram: any,
  taskQueue: PublicKey
): Promise<{
  taskId: number;
  preTaskId: number;
  task: PublicKey;
  preTask: PublicKey;
}> {
  const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
  const [taskId, preTaskId] = nextAvailableTaskIds(
    taskQueueAcc.taskBitmap,
    2,
    false,
    taskQueueAcc.capacity
  );
  return {
    taskId,
    preTaskId,
    task: taskKey(taskQueue, taskId)[0],
    preTask: taskKey(taskQueue, preTaskId)[0],
  };
}

/**
 * The rent refund of each task in `taskPubkeys` that exists on chain, as writable
 * accounts with no duplicate key. The tuktuk program's dequeue_task_v0 closes a
 * task only to the task's own `rent_refund` field, which is set at queue time to
 * whoever paid to queue it, not necessarily the wallet running this script. So
 * resolve it from the on-chain task rather than assuming it's the current payer.
 *
 * An account with nothing currently scheduled points its task field back at
 * itself (or at the program id, legacy); in that case there's nothing to
 * dequeue, and that task adds no account.
 */
export async function resolveTaskRentRefund(
  tuktukProgram: any,
  taskPubkeys: PublicKey[],
  ownerPubkey: PublicKey,
  ownerProgramId: PublicKey
): Promise<AccountMeta[]> {
  const rentRefunds = new Map<string, AccountMeta>();
  for (const taskPubkey of taskPubkeys) {
    if (taskPubkey.equals(ownerPubkey) || taskPubkey.equals(ownerProgramId)) {
      continue;
    }
    const task = await tuktukProgram.account.taskV0.fetchNullable(taskPubkey);
    if (task) {
      const pubkey = task.rentRefund as PublicKey;
      rentRefunds.set(pubkey.toBase58(), {
        pubkey,
        isWritable: true,
        isSigner: false,
      });
    }
  }
  return [...rentRefunds.values()];
}
