import { AnchorProvider } from "@project-serum/anchor";
import {
  Commitment,
  Connection,
  Finality,
  PublicKey,
  RpcResponseAndContext,
  SendOptions,
  SignatureResult,
  SignatureStatus,
  Signer,
  SimulatedTransactionResponse,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
} from "@solana/web3.js";
import { ProgramError } from "./anchorError";

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

export async function sendInstructions(
  idlErrors: Map<number, string>,
  provider: AnchorProvider,
  instructions: TransactionInstruction[],
  signers: Signer[],
  payer: PublicKey = provider.wallet.publicKey,
  commitment: Commitment = "confirmed"
): Promise<string> {
  let tx = new Transaction();
  tx.recentBlockhash = (
    await provider.connection.getRecentBlockhash()
  ).blockhash;
  tx.feePayer = payer || provider.wallet.publicKey;
  tx.add(...instructions);
  if (signers.length > 0) {
    tx.partialSign(...signers);
  }
  tx = await provider.wallet.signTransaction(tx);

  try {
    const { txid } = await sendAndConfirmWithRetry(
      provider.connection,
      tx.serialize(),
      {
        skipPreflight: true,
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
  idlErrors: Map<number, string>,
  provider: AnchorProvider,
  instructionGroups: TransactionInstruction[][],
  signerGroups: Signer[][],
  payer?: PublicKey,
  finality: Finality = "confirmed"
): Promise<Iterable<string>> {
  const recentBlockhash = (
    await provider.connection.getRecentBlockhash("confirmed")
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
  let done = false;
  let status: SignatureStatus | null | void = {
    slot: 0,
    confirmations: 0,
    err: null,
  };
  let subId = 0;
  status = await new Promise(async (resolve, reject) => {
    setTimeout(() => {
      if (done) {
        return;
      }
      done = true;
      console.log("Rejecting for timeout...");
      reject({ timeout: true });
    }, timeout);
    try {
      console.log("COMMIMENT", commitment);
      subId = connection.onSignature(
        txid,
        (result: any, context: any) => {
          done = true;
          status = {
            err: result.err,
            slot: context.slot,
            confirmations: 0,
          };
          if (result.err) {
            console.log("Rejected via websocket", result.err);
            reject(status);
          } else {
            console.log("Resolved via websocket", result);
            resolve(status);
          }
        },
        commitment
      );
    } catch (e) {
      done = true;
      console.error("WS error in setup", txid, e);
    }
    while (!done && queryStatus) {
      // eslint-disable-next-line no-loop-func
      (async () => {
        try {
          const signatureStatuses = await connection.getSignatureStatuses([
            txid,
          ]);
          status = signatureStatuses && signatureStatuses.value[0];
          if (!done) {
            if (!status) {
              console.log("REST null result for", txid, status);
            } else if (status.err) {
              console.log("REST error for", txid, status);
              done = true;
              reject(status.err);
            } else if (!status.confirmations && !status.confirmationStatus) {
              console.log("REST no confirmations for", txid, status);
            } else {
              console.log("REST confirmation for", txid, status);
              if (
                !status.confirmationStatus ||
                status.confirmationStatus == commitment
              ) {
                done = true;
                resolve(status);
              }
            }
          }
        } catch (e) {
          if (!done) {
            console.log("REST connection error: txid", txid, e);
          }
        }
      })();
      await sleep(2000);
    }
  });

  if (
    //@ts-ignore
    connection._signatureSubscriptions &&
    //@ts-ignore
    connection._signatureSubscriptions[subId]
  ) {
    connection.removeSignatureListener(subId);
  }
  done = true;
  console.log("Returning status ", status);
  return status;
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
  const startTime = getUnixTime();
  (async () => {
    while (!done && getUnixTime() - startTime < timeout) {
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
        commitment: "confirmed"
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
      commitment: "confirmed"
    });
    if (tx && tx.meta.logMessages) {
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
