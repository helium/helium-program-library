import {
  AccountMeta,
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Ed25519Program,
  Keypair,
  PACKET_DATA_SIZE,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { DCA_SWAP_MAX_BYTES } from "./jupiter";

/**
 * The largest transaction the crank turner sends: `MAX_TRANSACTION_SIZE` in tuktuk's
 * solana-transaction-utils. A run whose instructions do not fit fails there with
 * IxGroupTooLarge, and the DCA order never runs.
 */
export const CRANK_MAX_TX_BYTES = PACKET_DATA_SIZE;

/** The remote task this service answers with, as the crank turner checks it. */
export interface SignedRemoteTask {
  /** The DCA signer, whose key the task names. */
  signer: PublicKey;
  /** The serialized RemoteTaskTransactionV0. */
  message: Buffer;
  signature: Buffer;
}

/**
 * The size of the transaction the crank turner builds to run a remote task, or undefined when
 * its message overruns the packet limit.
 *
 * The crank turner's transaction holds, in order: its default compute unit limit and price, an
 * ed25519 check of the signed remote task, and `run_task_v0` (`runTask`). Its lookup tables are
 * the task queue's and the ones this service answers with. The compute unit values do not change
 * the size, as both are fixed-width.
 */
export const crankTransactionSize = (
  remoteTask: SignedRemoteTask,
  runTask: TransactionInstruction,
  lookupTables: AddressLookupTableAccount[]
): number | undefined => {
  const payer = runTask.keys.find((key) => key.isSigner)?.pubkey;
  if (!payer) {
    throw new Error("run_task_v0 names no crank turner");
  }
  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
    Ed25519Program.createInstructionWithPublicKey({
      publicKey: remoteTask.signer.toBytes(),
      message: remoteTask.message,
      signature: remoteTask.signature,
    }),
    runTask,
  ];
  try {
    const message = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: PublicKey.default.toBase58(),
      instructions,
    }).compileToV0Message(lookupTables);
    return new VersionedTransaction(message).serialize().length;
  } catch (error) {
    if (error instanceof RangeError) {
      return undefined;
    }
    throw error;
  }
};

const fits = (size: number | undefined): size is number =>
  size !== undefined && size <= CRANK_MAX_TX_BYTES;

/** An order refused because no route builds a crank transaction that fits. */
export class CrankTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrankTooLargeError";
  }
}

const describeSize = (size: number | undefined): string =>
  size === undefined ? `over ${CRANK_MAX_TX_BYTES} bytes` : `${size} bytes`;

/**
 * The smallest signed transaction whose message overruns the packet limit: one signature, its
 * length byte and a message one byte too long. web3.js throws only when the message alone is over
 * PACKET_DATA_SIZE.
 */
const OVERRUN_MIN_TX_BYTES = PACKET_DATA_SIZE + 1 + 1 + 64;

/**
 * The `maxBytes` for the one retry of an order whose crank transaction came to `size` bytes, or
 * whose message overran the packet limit when `size` is undefined: the default budget less the
 * overshoot. An unknown size counts as OVERRUN_MIN_TX_BYTES. The swap's bytes reach the crank transaction
 * about one for one, as instruction data in the signed task and as accounts of run_task_v0, but
 * that is not exact, so the retry can still miss.
 */
export const retrySwapMaxBytes = (size: number | undefined): number =>
  DCA_SWAP_MAX_BYTES - ((size ?? OVERRUN_MIN_TX_BYTES) - CRANK_MAX_TX_BYTES);

/**
 * Build an order's remote task with the default `maxBytes`. When its crank transaction does not
 * fit, build it once more with `retrySwapMaxBytes`, and refuse the order when that still does
 * not fit. `build` returns the task and its crank transaction size.
 */
export const buildFittingTask = async <T>(
  build: (maxBytes: number) => Promise<{ task: T; size: number | undefined }>
): Promise<T> => {
  const first = await build(DCA_SWAP_MAX_BYTES);
  if (fits(first.size)) {
    return first.task;
  }
  const retryMaxBytes = retrySwapMaxBytes(first.size);
  const refusal = (size: number | undefined) =>
    new CrankTooLargeError(
      `Jupiter found no route for this DCA order whose crank transaction fits (${describeSize(
        size
      )}, limit ${CRANK_MAX_TX_BYTES})`
    );
  if (retryMaxBytes <= 0) {
    throw refusal(first.size);
  }
  console.warn(
    "DCA crank transaction too large; retrying with a smaller maxBytes",
    {
      size: first.size ?? null,
      retryMaxBytes,
    }
  );
  const retry = await build(retryMaxBytes);
  if (fits(retry.size)) {
    return retry.task;
  }
  throw refusal(retry.size);
};

/**
 * The remaining accounts of run_task_v0: the compiled task's accounts, none of them signing,
 * followed by `freeTaskCount` random writable stand-ins for the free task accounts.
 */
export const runTaskRemainingAccounts = (
  remainingAccounts: AccountMeta[],
  freeTaskCount: number
): AccountMeta[] => [
  ...remainingAccounts.map((acc) => ({ ...acc, isSigner: false })),
  ...Array.from({ length: freeTaskCount }, () => ({
    pubkey: Keypair.generate().publicKey,
    isWritable: true,
    isSigner: false,
  })),
];

/**
 * The crank transaction size of a signed remote task: `runTask` builds run_task_v0 over the
 * task's accounts and one stand-in per free task, and the queue's and the swap's lookup
 * tables both compress it.
 */
export const signedTaskCrankSize = async ({
  remoteTask,
  remainingAccounts,
  freeTaskCount,
  queueLookupTables,
  swapLookupTables,
  runTask,
}: {
  remoteTask: SignedRemoteTask;
  remainingAccounts: AccountMeta[];
  freeTaskCount: number;
  queueLookupTables: AddressLookupTableAccount[];
  swapLookupTables: AddressLookupTableAccount[];
  runTask: (remaining: AccountMeta[]) => Promise<TransactionInstruction>;
}): Promise<number | undefined> =>
  crankTransactionSize(
    remoteTask,
    await runTask(runTaskRemainingAccounts(remainingAccounts, freeTaskCount)),
    [...queueLookupTables, ...swapLookupTables]
  );
