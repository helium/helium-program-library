import { Program } from "@coral-xyz/anchor";
import { MiniFanout } from "@helium/idls/lib/types/mini_fanout";
import { taskKey, nextAvailableTaskIds } from "@helium/tuktuk-sdk";
import { PublicKey } from "@solana/web3.js";

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
  const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(
    taskQueue
  );
  const [taskId, preTaskId] = nextAvailableTaskIds(taskQueueAcc.taskBitmap, 2);
  return {
    taskId,
    preTaskId,
    task: taskKey(taskQueue, taskId)[0],
    preTask: taskKey(taskQueue, preTaskId)[0],
  };
}

/**
 * The tuktuk program's dequeue_task_v0 requires the passed-in rent_refund
 * account to match the task's own `rent_refund` field exactly (it's a
 * `has_one` constraint), which is set at queue time to whoever paid to queue
 * it — not necessarily the wallet running this script. Resolve it from the
 * on-chain task rather than assuming it's the current payer.
 *
 * A mini-fanout with nothing currently scheduled points `next_task` /
 * `next_pre_task` back at itself (or at the program id, legacy); in that case
 * there's nothing to dequeue, so the returned value is unused by the caller
 * and any pubkey is safe to pass through.
 */
export async function resolveTaskRentRefund(
  tuktukProgram: any,
  taskPubkey: PublicKey,
  miniFanoutPubkey: PublicKey,
  miniFanoutProgramId: PublicKey,
  fallback: PublicKey
): Promise<PublicKey> {
  if (
    taskPubkey.equals(miniFanoutPubkey) ||
    taskPubkey.equals(miniFanoutProgramId)
  ) {
    return fallback;
  }
  const task = await tuktukProgram.account.taskV0.fetchNullable(taskPubkey);
  return task ? (task.rentRefund as PublicKey) : fallback;
}
