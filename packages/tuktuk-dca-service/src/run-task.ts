import { Program } from "@anchor-lang/core";
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk";
import {
  AccountMeta,
  Keypair,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";

/** A key that stands in for the crank turner, which signs and pays for run_task_v0. */
export const CRANK_TURNER_STAND_IN = Keypair.generate().publicKey;

/**
 * Build run_task_v0 for `task` as the crank turner sends it: the stand-in crank turner signs, the
 * task's own queue and rent refund account follow, and `remaining` comes last.
 */
export const runTaskBuilder =
  (
    tuktukProgram: Program<Tuktuk>,
    task: PublicKey,
    taskAccount: { taskQueue: PublicKey; rentRefund: PublicKey }
  ) =>
  (
    freeTaskIds: number[],
    remaining: AccountMeta[]
  ): Promise<TransactionInstruction> =>
    tuktukProgram.methods
      .runTaskV0({ freeTaskIds })
      .accountsPartial({
        crankTurner: CRANK_TURNER_STAND_IN,
        rentRefund: taskAccount.rentRefund,
        taskQueue: taskAccount.taskQueue,
        task,
      })
      .remainingAccounts(remaining)
      .instruction();
