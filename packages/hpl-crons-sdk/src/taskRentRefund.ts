import { init as initTuktuk } from "@helium/tuktuk-sdk";
import { AccountMeta, PublicKey } from "@solana/web3.js";

/**
 * The remaining accounts to append to an instruction that dequeues `task`. The instruction refunds
 * the task to the rent refund the task itself names, and that account must be writable. When the
 * task account does not exist, the instruction dequeues nothing and this returns no account. A bot
 * that never started stores the default key, which is no task; this returns no account for it.
 */
export const taskRentRefund = async (
  tuktukProgram: Awaited<ReturnType<typeof initTuktuk>>,
  task: PublicKey,
): Promise<AccountMeta[]> => {
  // The default key is the system program, which exists and is not a task.
  if (task.equals(PublicKey.default)) {
    return [];
  }
  const taskAcc = await tuktukProgram.account.taskV0.fetchNullable(task);
  return taskAcc
    ? [{ pubkey: taskAcc.rentRefund, isWritable: true, isSigner: false }]
    : [];
};
