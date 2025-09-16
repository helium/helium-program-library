import { AnchorProvider, Program, Provider } from "@coral-xyz/anchor";
import {
  AddressLookupTableAccount,
  Commitment,
  ComputeBudgetProgram,
  Connection,
  Finality,
  Keypair,
  Message,
  PublicKey,
  RpcResponseAndContext,
  SendOptions,
  SignatureStatus,
  Signer,
  SimulatedTransactionResponse,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  TransactionSignature,
  VersionedTransaction,
  VersionedTransactionResponse,
} from "@solana/web3.js";
import { TransactionCompletionQueue } from "@helium/account-fetch-cache";
import bs58 from "bs58";
import { ProgramError } from "./anchorError";
import {
  estimatePrioritizationFee,
  MAX_PRIO_FEE,
  withPriorityFees,
} from "./priorityFees";
import { TransactionDraft, populateMissingDraftInfo } from "./draft";

export const chunks = <T>(array: T[], size: number): T[][] =>
  Array.apply(0, new Array(Math.ceil(array.length / size))).map((_, index) =>
    array.slice(index * size, (index + 1) * size)
  );

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function promiseAllInOrder<T>(
  it: (() => Promise<T>)[]
): Promise<Iterable<T>> {
  let ret: T[] = [];
  for (const i of it) {
    ret.push(await i());
  }

  return ret;
}

export const getAddressLookupTableAccounts = async (
  connection: Connection,
  keys: PublicKey[]
): Promise<AddressLookupTableAccount[]> => {
  if (keys.length == 0) {
    return [];
  }

  const addressLookupTableAccountInfos =
    await connection.getMultipleAccountsInfo(
      keys.map((key) => new PublicKey(key))
    );

  return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
    const addressLookupTableAddress = keys[index];
    if (accountInfo) {
      const addressLookupTableAccount = new AddressLookupTableAccount({
        key: addressLookupTableAddress,
        state: AddressLookupTableAccount.deserialize(accountInfo.data),
      });
      acc.push(addressLookupTableAccount);
    }

    return acc;
  }, new Array<AddressLookupTableAccount>());
};

export function toVersionedTx(tx: TransactionDraft): VersionedTransaction {
  const messageV0 = new TransactionMessage({
    payerKey: tx.feePayer,
    recentBlockhash: tx.recentBlockhash!,
    instructions: tx.instructions,
  }).compileToV0Message(tx.addressLookupTables!);
  return new VersionedTransaction(messageV0);
}

export interface InstructionResult<A> {
  instructions: TransactionInstruction[];
  signers: Signer[];
  output: A;
}

export interface BigInstructionResult<A> {
  instructions: TransactionInstruction[][];
  signers: Signer[][];
  output: A;
}

export async function sendInstructionsWithPriorityFee(
  provider: AnchorProvider,
  instructions: TransactionInstruction[],
  {
    signers = [],
    payer = provider.wallet.publicKey,
    commitment = "confirmed",
    idlErrors = new Map(),
    computeUnitLimit = 200000,
    basePriorityFee = 1,
    maxPriorityFee = MAX_PRIO_FEE,
    priorityFeeOptions,
  }: {
    signers?: Signer[];
    payer?: PublicKey;
    commitment?: Commitment;
    idlErrors?: Map<number, string>;
    computeUnitLimit?: number;
    basePriorityFee?: number;
    maxPriorityFee?: number;
    priorityFeeOptions?: any;
  } = {}
): Promise<string> {
  return await sendInstructions(
    provider,
    [
      ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }),
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: await estimatePrioritizationFee(
          provider.connection,
          instructions,
          basePriorityFee,
          maxPriorityFee,
          priorityFeeOptions
        ),
      }),
      ...instructions,
    ],
    signers,
    payer,
    commitment,
    idlErrors
  );
}

export async function sendInstructions(
  provider: AnchorProvider,
  instructions: TransactionInstruction[],
  signers: Signer[] = [],
  payer: PublicKey = provider.wallet.publicKey,
  commitment: Commitment = "confirmed",
  idlErrors: Map<number, string> = new Map()
): Promise<string> {
  if (instructions.length == 0) {
    return "";
  }

  let tx = new Transaction();
  tx.recentBlockhash = (
    await provider.connection.getLatestBlockhash()
  ).blockhash;
  tx.feePayer = payer || provider.wallet.publicKey;
  tx.add(...instructions);
  if (signers.length > 0) {
    tx.partialSign(...signers);
  }
  if (
    tx.feePayer.equals(provider.wallet.publicKey) ||
    tx.instructions.some((ix) =>
      ix.keys.some(
        (key) => key.isSigner && key.pubkey.equals(provider.wallet.publicKey)
      )
    )
  ) {
    tx = await provider.wallet.signTransaction(tx);
  }

  try {
    const { txid } = await sendAndConfirmWithRetry(
      provider.connection,
      tx.serialize(),
      {
        skipPreflight: true,
        maxRetries: 0,
      },
      commitment
    );
    return txid;
  } catch (e) {
    console.error(e);
    const wrappedE = ProgramError.parse(e, idlErrors);
    throw wrappedE == null ? e : wrappedE;
  }
}

type Truthy<T> = T extends false | "" | 0 | null | undefined ? never : T; // from lodash

function truthy<T>(value: T): value is Truthy<T> {
  return !!value;
}

export async function sendMultipleInstructions(
  provider: AnchorProvider,
  instructionGroups: TransactionInstruction[][],
  signerGroups: Signer[][],
  payer?: PublicKey,
  finality: Finality = "confirmed",
  idlErrors: Map<number, string> = new Map()
): Promise<Iterable<string>> {
  const recentBlockhash = (
    await provider.connection.getLatestBlockhash("confirmed")
  ).blockhash;

  const ixAndSigners = instructionGroups
    .map((instructions, i) => {
      const signers = signerGroups[i];

      return {
        instructions,
        signers,
      };
    })
    .filter(({ instructions }) => instructions.length > 0);
  const txns = ixAndSigners.map(({ instructions }) => {
    const tx = new Transaction({
      feePayer: payer || provider.wallet.publicKey,
      recentBlockhash,
    });

    tx.add(...instructions);

    return tx;
  });

  const txnsSignedByWallet = await provider.wallet.signAllTransactions(txns);
  const txnsSigned = txnsSignedByWallet
    .map((tx, index) => {
      const signers = ixAndSigners[index].signers;

      if (signers.length > 0) {
        tx.partialSign(...signers);
      }

      return tx;
    })
    .map((tx) => tx.serialize());

  console.log("Sending multiple transactions...");
  try {
    return await promiseAllInOrder(
      txnsSigned.map((txn) => async () => {
        const { txid } = await sendAndConfirmWithRetry(
          provider.connection,
          txn,
          {
            skipPreflight: true,
          },
          finality
        );
        return txid;
      })
    );
  } catch (e) {
    console.error(e);
    const wrappedE = ProgramError.parse(e, idlErrors);
    throw wrappedE == null ? e : wrappedE;
  }
}

export async function execute<Output>(
  program: Program<any>,
  provider: AnchorProvider,
  command: InstructionResult<Output>,
  payer: PublicKey = provider.wallet.publicKey,
  commitment?: Commitment
): Promise<Output & { txid?: string }> {
  const { instructions, signers, output } = command;
  const errors = program.idl.errors?.reduce((acc: any, err: any) => {
    acc.set(err.code, `${err.name}: ${err.msg}`);
    return acc;
  }, new Map<number, string>());
  if (instructions.length > 0) {
    const txid = await sendInstructions(
      provider,
      instructions,
      signers,
      payer,
      commitment,
      errors
    );
    return { txid, ...output };
  }

  // @ts-ignore
  return output;
}

export async function executeBig<Output>(
  program: Program,
  provider: AnchorProvider,
  command: BigInstructionResult<Output>,
  payer: PublicKey = provider.wallet.publicKey,
  finality?: Finality
): Promise<Output & { txids?: string[] }> {
  const { instructions, signers, output } = command;
  const errors = program.idl.errors?.reduce((acc, err) => {
    acc.set(err.code, `${err.name}: ${err.msg}`);
    return acc;
  }, new Map<number, string>());
  if (instructions.length > 0) {
    const txids = await sendMultipleInstructions(
      provider,
      instructions,
      signers,
      payer || provider.wallet.publicKey,
      finality,
      errors
    );
    return {
      ...output,
      txids: Array.from(txids),
    };
  }

  // @ts-ignore
  return output;
}

function getUnixTime(): number {
  return new Date().valueOf() / 1000;
}

export const awaitTransactionSignatureConfirmation = async (
  txid: TransactionSignature,
  timeout: number,
  connection: Connection,
  commitment: Commitment = "recent",
  queryStatus = false
): Promise<SignatureStatus | null | void> => {
  return new TransactionCompletionQueue({
    connection,
    log: true,
  }).wait(commitment, txid, timeout);
};

async function simulateTransaction(
  connection: Connection,
  transaction: Transaction,
  commitment: Commitment
): Promise<RpcResponseAndContext<SimulatedTransactionResponse>> {
  // @ts-ignore
  transaction.recentBlockhash = await connection._recentBlockhash(
    // @ts-ignore
    connection._disableBlockhashCaching
  );

  const signData = transaction.serializeMessage();
  // @ts-ignore
  const wireTransaction = transaction._serialize(signData);
  const encodedTransaction = wireTransaction.toString("base64");
  const config: any = { encoding: "base64", commitment };
  const args = [encodedTransaction, config];

  // @ts-ignore
  const res = await connection._rpcRequest("simulateTransaction", args);
  if (res.error) {
    throw new Error("failed to simulate transaction: " + res.error.message);
  }
  return res.result;
}

const DEFAULT_TIMEOUT = 3 * 60 * 1000; // 3 minutes
/*
    A validator has up to 120s to accept the transaction and send it into a block.
    If it doesn’t happen within that timeframe, your transaction is dropped and you’ll need
    to send the transaction again. You can get the transaction signature and periodically
    Ping the network for that transaction signature. If you never get anything back,
    that means it’s definitely been dropped. If you do get a response back, you can keep pinging
    that means it’s definitely been dropped. If you do get a response back, you can keep pinging
    until it’s gone to a confirmed status to move on.
  */
export async function sendAndConfirmWithRetry(
  connection: Connection,
  txn: Buffer,
  sendOptions: SendOptions,
  commitment: Commitment,
  timeout = DEFAULT_TIMEOUT
): Promise<{ txid: string }> {
  let done = false;
  let slot = 0;
  const txid = await connection.sendRawTransaction(txn, sendOptions);
  console.log("txid", txid);
  const startTime = getUnixTime();
  (async () => {
    while (!done && getUnixTime() - startTime < timeout / 1000) {
      await connection.sendRawTransaction(txn, sendOptions);
      await sleep(500);
    }
  })();
  try {
    const confirmation = await awaitTransactionSignatureConfirmation(
      txid,
      timeout,
      connection,
      commitment,
      true
    );

    if (!confirmation)
      throw new Error("Timed out awaiting confirmation on transaction");

    if (confirmation.err) {
      const tx = await connection.getTransaction(txid, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      console.error(tx?.meta?.logMessages?.join("\n"));
      console.error(confirmation.err);
      throw new Error("Transaction failed: Custom instruction error");
    }

    slot = confirmation?.slot || 0;
  } catch (err: any) {
    console.error("Error caught", err);
    if (err.timeout) {
      throw new Error("Timed out awaiting confirmation on transaction");
    }

    const tx = await connection.getTransaction(txid, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (tx && tx.meta && tx.meta.logMessages) {
      console.error(tx.meta.logMessages.join("\n"));
    }

    if (err.err) {
      throw err.err;
    }

    throw err;
  } finally {
    done = true;
  }

  console.log("Latency", txid, getUnixTime() - startTime);

  return { txid };
}

export function stringToTransaction(solanaTransaction: string) {
  return Transaction.from(Buffer.from(solanaTransaction));
}

export function bufferToTransaction(solanaTransaction: Buffer) {
  return Transaction.from(solanaTransaction);
}

async function withRetries<A>(
  tries: number,
  input: () => Promise<A>
): Promise<A> {
  for (let i = 0; i < tries; i++) {
    try {
      return await input();
    } catch (e) {
      console.log(`Retrying ${i}...`, e);
    }
  }
  throw new Error("Failed after retries");
}

export type Status = {
  totalTxs: number;
  totalProgress: number;
  currentBatchProgress: number;
  currentBatchSize: number;
};
const TX_BATCH_SIZE = 100;
export async function bulkSendTransactions(
  provider: Provider,
  txs: TransactionDraft[],
  onProgress?: (status: Status) => void,
  triesRemaining: number = 10, // Number of blockhashes to try resending txs with before giving up
  extraSigners: Keypair[] = [],
  maxSignatureBatch: number = TX_BATCH_SIZE
): Promise<string[]> {
  let ret: string[] = [];

  // attempt to chunk by blockhash bounds (so signing doesn't take too long)
  for (let chunk of chunks(txs, maxSignatureBatch)) {
    const thisRet: string[] = [];
    // Continually send in bulk while resetting blockhash until we send them all
    while (true) {
      const recentBlockhash = await withRetries(5, () =>
        provider.connection.getLatestBlockhash("confirmed")
      );
      const blockhashedTxs = await Promise.all(
        chunk.map(async (tx) => {
          await populateMissingDraftInfo(provider.connection, tx);
          return toVersionedTx({
            instructions: tx.instructions,
            recentBlockhash: recentBlockhash.blockhash,
            addressLookupTableAddresses: tx.addressLookupTableAddresses,
            addressLookupTables: tx.addressLookupTables!,
            feePayer: tx.feePayer,
          });
        })
      );
      const signedTxs = (
        await (provider as AnchorProvider).wallet.signAllTransactions(
          blockhashedTxs
        )
      ).map((tx, i) => {
        extraSigners.forEach((signer: Keypair) => {
          if (
            chunk[i].signers?.some((sig) =>
              sig.publicKey.equals(signer.publicKey)
            )
          ) {
            tx.sign([signer]);
          }
        }, tx);
        return tx;
      });

      const txsWithSigs = signedTxs.map((tx, index) => {
        return {
          transaction: chunk[index],
          sig: bs58.encode(tx.signatures[0]),
        };
      });
      const confirmedTxs = await bulkSendRawTransactions(
        provider.connection,
        signedTxs.map((s) => Buffer.from(s.serialize())),
        ({ totalProgress, ...rest }) =>
          onProgress &&
          onProgress({
            ...rest,
            totalTxs: txs.length,
            totalProgress: totalProgress + ret.length + thisRet.length,
          }),
        recentBlockhash.lastValidBlockHeight,
        // Hail mary, try with preflight enabled. Sometimes this causes
        // errors that wouldn't otherwise happen
        triesRemaining != 1
      );
      thisRet.push(...confirmedTxs);
      if (confirmedTxs.length == signedTxs.length) {
        break;
      }

      const retSet = new Set(thisRet);

      chunk = txsWithSigs
        .filter(({ sig }) => !retSet.has(sig))
        .map(({ transaction }) => transaction);

      triesRemaining--;
      if (triesRemaining <= 0) {
        throw new Error(
          `Failed to submit all txs after blockhashes expired, ${signedTxs.length - confirmedTxs.length
          } remain`
        );
      }
    }
    ret.push(...thisRet);
  }

  return ret;
}

// Returns the list of succesfully sent txns
// NOTE: The return signatures are ordered by confirmation, not by order they are passed
// This list should be in order. Seom txns may fail
// due to blockhash exp
export async function bulkSendRawTransactions(
  connection: Connection,
  txs: Buffer[],
  onProgress?: (status: Status) => void,
  lastValidBlockHeight?: number,
  skipPreflight: boolean = true,
  maxRetries: number = 0
): Promise<string[]> {
  const txBatchSize = TX_BATCH_SIZE;
  let totalProgress = 0;
  const ret: string[] = [];
  if (!lastValidBlockHeight) {
    const blockhash = await withRetries(5, () =>
      connection.getLatestBlockhash("confirmed")
    );
    lastValidBlockHeight = blockhash.lastValidBlockHeight;
  }

  for (let chunk of chunks(txs, txBatchSize)) {
    let currentBatchProgress = 0;

    let pendingCount = chunk.length;
    let txids: string[] = [];
    let lastRetry = 0;

    while (pendingCount > 0) {
      if (
        (await withRetries(5, () => connection.getBlockHeight())) >
        lastValidBlockHeight
      ) {
        return ret;
      }

      // only resend txs every 4s
      if (lastRetry < new Date().valueOf() - 4 * 1000) {
        lastRetry = new Date().valueOf();
        txids = [];
        for (const tx of chunk) {
          const txid = await connection.sendRawTransaction(tx, {
            skipPreflight,
            maxRetries,
          });
          txids.push(txid);
        }
      }

      const statuses = await getAllTxns(connection, txids);
      const completed = statuses.filter((status) => status !== null);
      totalProgress += completed.length;
      currentBatchProgress += completed.length;
      onProgress &&
        onProgress({
          totalTxs: txs.length,
          totalProgress: totalProgress,
          currentBatchProgress: currentBatchProgress,
          currentBatchSize: txBatchSize,
        });
      const failures = completed
        .map((status) => status !== null && status.meta?.err)
        .filter(truthy);

      if (failures.length > 0) {
        const failureIndexes = statuses.map((status, index) => status?.meta?.err ? index : null).filter(truthy);
        const failedTxs = await Promise.all(failureIndexes.map(index => connection.getTransaction(txids[index], { commitment: "confirmed", maxSupportedTransactionVersion: 0 })));
        for (const tx of failedTxs) {
          console.error(tx?.meta?.logMessages?.join("\n"));
        }
        throw new Error("Failed to run txs");
      }
      ret.push(
        ...txids
          .map((txid, idx) => (statuses[idx] == null ? null : txid))
          .filter(truthy)
      );
      chunk = chunk.filter((_, index) => statuses[index] === null);
      txids = txids.filter((_, index) => statuses[index] === null);
      pendingCount -= completed.length;
      await sleep(1000); // Wait one seconds before querying again
    }
  }

  return ret;
}

const MAX_GET_SIGNATURE_STATUSES_QUERY_ITEMS = 200;
async function getAllTxns(
  connection: Connection,
  txids: string[]
): Promise<(VersionedTransactionResponse | null)[]> {
  return (
    await Promise.all(
      chunks(txids, MAX_GET_SIGNATURE_STATUSES_QUERY_ITEMS).map((txids) =>
        connection.getTransactions(txids, {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        })
      )
    )
  ).flat();
}

// Batch instructions parallel into as many txs as it takes
export async function batchParallelInstructions({
  provider,
  instructions,
  onProgress,
  triesRemaining = 10,
  extraSigners = [],
  maxSignatureBatch = TX_BATCH_SIZE,
  maxTxSize = 1232,
  addressLookupTableAddresses = [],
}: {
  provider: AnchorProvider;
  instructions: TransactionInstruction[];
  maxTxSize?: number;
  onProgress?: (status: Status) => void;
  triesRemaining?: number; // Number of blockhashes to try resending txs with before giving up
  extraSigners?: Keypair[];
  maxSignatureBatch?: number;
  addressLookupTableAddresses?: PublicKey[];
}): Promise<void> {
  let currentTxInstructions: TransactionInstruction[] = [];
  const blockhash = (await provider.connection.getLatestBlockhash()).blockhash;
  const transactions: TransactionDraft[] = [];
  const addressLookupTables = await getAddressLookupTableAccounts(
    provider.connection,
    addressLookupTableAddresses
  );

  for (const instruction of instructions) {
    if (Array.isArray(instruction)) {
      currentTxInstructions.push(...instruction);
    } else {
      currentTxInstructions.push(instruction);
    }
    const tx = await toVersionedTx({
      feePayer: provider.wallet.publicKey,
      recentBlockhash: blockhash,
      instructions: currentTxInstructions,
      addressLookupTableAddresses,
      signers: extraSigners,
      addressLookupTables,
    });
    try {
      if (tx.serialize().length + 64 * tx.signatures.length > maxTxSize) {
        throw new Error("encoding overruns Uint8Array");
      }
    } catch (e: any) {
      if (e.toString().includes("encoding overruns Uint8Array")) {
        currentTxInstructions.pop();
        transactions.push({
          feePayer: provider.wallet.publicKey,
          recentBlockhash: blockhash,
          instructions: currentTxInstructions,
          addressLookupTableAddresses,
          signers: extraSigners,
          addressLookupTables,
        });
        if (Array.isArray(instruction)) {
          currentTxInstructions = instruction;
        } else {
          currentTxInstructions = [instruction];
        }
      } else {
        throw e;
      }
    }
  }

  if (currentTxInstructions.length > 0) {
    transactions.push({
      feePayer: provider.wallet.publicKey,
      recentBlockhash: blockhash,
      instructions: currentTxInstructions,
      addressLookupTableAddresses,
      signers: extraSigners,
      addressLookupTables,
    });
  }

  await bulkSendTransactions(
    provider,
    transactions,
    onProgress,
    triesRemaining,
    extraSigners,
    maxSignatureBatch
  );
}

export async function batchSequentialParallelInstructions({
  provider,
  instructions,
  onProgress,
  triesRemaining = 10,
  extraSigners = [],
  maxSignatureBatch = TX_BATCH_SIZE,
}: {
  provider: AnchorProvider;
  instructions: TransactionInstruction[][];
  onProgress?: (status: Status) => void;
  triesRemaining?: number; // Number of blockhashes to try resending txs with before giving up
  extraSigners?: Keypair[];
  maxSignatureBatch?: number;
  addressLookupTableAddresses?: PublicKey[];
}): Promise<void> {
  for (const instruction of instructions) {
    await batchParallelInstructionsWithPriorityFee(provider, instruction, {
      onProgress,
      triesRemaining,
      extraSigners,
      maxSignatureBatch,
    });
  }
}

export async function batchInstructionsToTxsWithPriorityFee(
  provider: AnchorProvider,
  // If passing an array of arrays, that indicates the instructions need to be run in the same tx,
  // optionally with the ones around it.
  instructions: TransactionInstruction[] | TransactionInstruction[][],
  {
    computeUnitLimit,
    basePriorityFee,
    addressLookupTableAddresses,
    computeScaleUp,
    maxTxSize = 1232,
    extraSigners = [],
    useFirstEstimateForAll = false,
    maxInstructionsPerTx,
  }: {
    // Manually specify limit instead of simulating
    computeUnitLimit?: number;
    // Manually specify max tx size, useful to leave room for multisigs
    maxTxSize?: number;
    // Multiplier to increase compute to account for changes in runtime vs simulation
    computeScaleUp?: number;
    basePriorityFee?: number;
    addressLookupTableAddresses?: PublicKey[];
    extraSigners?: Signer[];
    // Instead of populating priority fee and compute per tx, just use the same prio fee and compute
    // for all txs. Only use this if all instructions are roughly the same.
    useFirstEstimateForAll?: boolean;
    // Optional parameter to limit number of instructions per transaction
    maxInstructionsPerTx?: number;
  } = {}
): Promise<TransactionDraft[]> {
  let currentTxInstructions: TransactionInstruction[] = [];
  const blockhash = (await provider.connection.getLatestBlockhash()).blockhash;
  const transactions: TransactionDraft[] = [];
  const addressLookupTables = await getAddressLookupTableAccounts(
    provider.connection,
    addressLookupTableAddresses || []
  );

  let firstTxComputeAndPrio: TransactionInstruction[] | null = null;
  for (const instruction of instructions) {
    if (!instruction) continue;
    const instrArr = Array.isArray(instruction) ? instruction : [instruction];
    const prevLen = currentTxInstructions.length;
    currentTxInstructions.push(...instrArr);
    const tx = await toVersionedTx({
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnitLimit || 100000,
        }),
        ComputeBudgetProgram.setComputeUnitPrice({
          // Placeholder, will be replaced with actual value
          microLamports: 1,
        }),
        ...currentTxInstructions,
      ],
      addressLookupTableAddresses: addressLookupTableAddresses || [],
      feePayer: provider.wallet.publicKey,
      recentBlockhash: blockhash,
      addressLookupTables,
    });
    try {
      if (
        tx.serialize().length + 64 * tx.signatures.length > maxTxSize ||
        (maxInstructionsPerTx &&
          currentTxInstructions.length > maxInstructionsPerTx)
      ) {
        throw new Error("encoding overruns Uint8Array");
      }
    } catch (e: any) {
      if (e.toString().includes("encoding overruns Uint8Array")) {
        currentTxInstructions = currentTxInstructions.slice(0, prevLen);
        if (currentTxInstructions.length > 0) {
          // If we've already estimated the compute and priority fee for the first tx, we can use that for
          // all txs. Otherwise, we estimate it for each tx individually.
          // Only do this optimization if `useFirstEstimateForAll` is set. This is necessary for
          // large sets of txs to avoid spamming the rpc.
          let ixs: TransactionInstruction[] = [];
          if (firstTxComputeAndPrio) {
            ixs = [...firstTxComputeAndPrio, ...currentTxInstructions];
          } else {
            ixs = await withPriorityFees({
              connection: provider.connection,
              instructions: currentTxInstructions,
              computeUnits: computeUnitLimit,
              computeScaleUp,
              basePriorityFee,
              addressLookupTables,
              feePayer: provider.wallet.publicKey,
            });
            if (useFirstEstimateForAll) {
              firstTxComputeAndPrio = ixs.slice(0, 2);
            }
          }

          transactions.push({
            instructions: ixs,
            addressLookupTableAddresses: addressLookupTableAddresses || [],
            feePayer: provider.wallet.publicKey,
            recentBlockhash: blockhash,
            addressLookupTables,
            signers: extraSigners.filter((s) =>
              currentTxInstructions.some((ix) =>
                ix.keys.some((k) => k.pubkey.equals(s.publicKey) && k.isSigner)
              )
            ),
          });
        }

        currentTxInstructions = instrArr;
      } else {
        throw e;
      }
    }
  }

  if (currentTxInstructions.length > 0) {
    transactions.push({
      instructions: await withPriorityFees({
        connection: provider.connection,
        instructions: currentTxInstructions,
        computeUnits: computeUnitLimit,
        computeScaleUp,
        basePriorityFee,
        addressLookupTables,
        feePayer: provider.wallet.publicKey,
      }),
      addressLookupTableAddresses: addressLookupTableAddresses || [],
      feePayer: provider.wallet.publicKey,
      recentBlockhash: blockhash,
      addressLookupTables,
      signers: extraSigners.filter((s) =>
        currentTxInstructions.some((ix) =>
          ix.keys.some((k) => k.pubkey.equals(s.publicKey) && k.isSigner)
        )
      ),
    });
  }

  return transactions;
}

export async function batchParallelInstructionsWithPriorityFee(
  provider: AnchorProvider,
  // If passing an array of arrays, that indicates the instructions need to be run in the same tx,
  // optionally with the ones around it.
  instructions: TransactionInstruction[] | TransactionInstruction[][],
  {
    onProgress,
    triesRemaining = 10,
    computeUnitLimit,
    computeScaleUp,
    basePriorityFee,
    extraSigners,
    maxSignatureBatch = TX_BATCH_SIZE,
  }: {
    // Manually specify limit instead of simulating
    computeUnitLimit?: number;
    // Multiplier to increase compute to account for changes in runtime vs simulation
    computeScaleUp?: number;
    onProgress?: (status: Status) => void;
    triesRemaining?: number; // Number of blockhashes to try resending txs with before giving up
    basePriorityFee?: number;
    extraSigners?: Keypair[];
    maxSignatureBatch?: number;
  } = {}
): Promise<void> {
  const transactions = await batchInstructionsToTxsWithPriorityFee(
    provider,
    instructions,
    {
      computeUnitLimit,
      basePriorityFee,
      computeScaleUp,
    }
  );

  await bulkSendTransactions(
    provider,
    transactions,
    onProgress,
    triesRemaining,
    extraSigners,
    maxSignatureBatch
  );
}
