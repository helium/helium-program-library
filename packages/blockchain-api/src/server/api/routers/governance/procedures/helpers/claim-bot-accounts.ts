import { queueAuthorityKey } from "@helium/hpl-crons-sdk";
import {
  PROGRAM_ID as TUKTUK_PROGRAM_ID,
  taskQueueAuthorityKey,
} from "@helium/tuktuk-sdk";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";

/**
 * Every account the delegation claim-bot instructions need, so they can be
 * built with `accountsStrict` and Anchor's resolvers never run. Left partial,
 * the `relations` constraints on `dao`, `mint`, `rent_refund` and `next_task`
 * make Anchor fetch the claim bot, the delegated position and the sub-DAO once
 * per position, which is what put a handful of sequential round trips behind
 * every automated position in a delegate request.
 */
export interface ClaimBotAccountsArgs {
  /** Payer, position authority, and owner of the position token account. */
  wallet: PublicKey;
  taskQueue: PublicKey;
  position: PublicKey;
  positionMint: PublicKey;
  delegatedPosition: PublicKey;
  delegationClaimBot: PublicKey;
}

const sharedAccounts = (args: ClaimBotAccountsArgs) => ({
  delegationClaimBot: args.delegationClaimBot,
  taskQueue: args.taskQueue,
  delegatedPosition: args.delegatedPosition,
  position: args.position,
  positionAuthority: args.wallet,
  mint: args.positionMint,
  positionTokenAccount: getAssociatedTokenAddressSync(
    args.positionMint,
    args.wallet,
    true,
  ),
  systemProgram: SystemProgram.programId,
});

/** The `task_queue_authority` PDA lives under the tuktuk program, not hpl-crons. */
const taskQueueAuthority = (taskQueue: PublicKey, queueAuthority: PublicKey) =>
  taskQueueAuthorityKey(taskQueue, queueAuthority, TUKTUK_PROGRAM_ID)[0];

export function initDelegationClaimBotAccounts(args: ClaimBotAccountsArgs) {
  return {
    ...sharedAccounts(args),
    payer: args.wallet,
  };
}

export function startDelegationClaimBotAccounts(
  args: ClaimBotAccountsArgs & {
    /** The task account the reserved id resolves to. */
    task: PublicKey;
    /** `delegation_claim_bot.next_task`, or `task` when the bot is new. */
    nextTask: PublicKey;
    /** `delegation_claim_bot.rent_refund`, or the wallet when the bot is new. */
    rentRefund: PublicKey;
    subDao: PublicKey;
    /** `sub_dao.dao`. */
    dao: PublicKey;
    /** `dao.hnt_mint`. */
    hntMint: PublicKey;
  },
) {
  const [queueAuthority] = queueAuthorityKey();

  return {
    ...sharedAccounts(args),
    payer: args.wallet,
    queueAuthority,
    taskQueueAuthority: taskQueueAuthority(args.taskQueue, queueAuthority),
    task: args.task,
    subDao: args.subDao,
    dao: args.dao,
    hntMint: args.hntMint,
    delegatorAta: getAssociatedTokenAddressSync(
      args.hntMint,
      args.wallet,
      true,
    ),
    tuktukProgram: TUKTUK_PROGRAM_ID,
    nextTask: args.nextTask,
    rentRefund: args.rentRefund,
  };
}

export function closeDelegationClaimBotAccounts(
  args: ClaimBotAccountsArgs & {
    /** `delegation_claim_bot.next_task`. */
    nextTask: PublicKey;
    /** `delegation_claim_bot.rent_refund`. */
    rentRefund: PublicKey;
  },
) {
  const [queueAuthority] = queueAuthorityKey();

  return {
    ...sharedAccounts(args),
    rentRefund: args.rentRefund,
    nextTask: args.nextTask,
    taskQueueAuthority: taskQueueAuthority(args.taskQueue, queueAuthority),
    queueAuthority,
    tuktukProgram: TUKTUK_PROGRAM_ID,
  };
}
