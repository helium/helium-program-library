import { BN } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";

export interface DcaTaskRequest {
  task: PublicKey;
  taskQueue: PublicKey;
  taskQueuedAt: BN;
}

export interface DcaTaskFields {
  nextTask: PublicKey;
  taskQueue: PublicKey;
  queuedAt: BN;
}

// The signature only covers the task and queue this DCA names, so the
// request has to match the on-chain account before anything is built.
// Returns the rejection reason, or null when the request names the DCA's task.
export const dcaTaskBindingError = (
  request: DcaTaskRequest,
  dca: DcaTaskFields,
): string | null => {
  if (!request.task.equals(dca.nextTask)) {
    return "task does not match dca next_task";
  }
  if (!request.taskQueue.equals(dca.taskQueue)) {
    return "task_queue does not match dca task_queue";
  }
  if (!request.taskQueuedAt.eq(dca.queuedAt)) {
    return "task_queued_at does not match dca queued_at";
  }
  return null;
};
