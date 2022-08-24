import { Provider, AnchorProvider } from "@project-serum/anchor";
import { Transaction } from "@solana/web3.js";
import { ProgramError } from "./anchorError";
import axios from "axios";
import { sendAndConfirmWithRetry } from "./transaction";

async function promiseAllInOrder<T>(
  it: (() => Promise<T>)[]
): Promise<Iterable<T>> {
  let ret: T[] = [];
  for (const i of it) {
    ret.push(await i());
  }

  return ret;
}

/**
 * Execute transactions from a remote server (either single or multiple transactions)
 * @param provider
 * @param url
 * @param body
 * @param errors
 * @returns
 */
export async function executeRemoteTxn(
  provider: AnchorProvider,
  url: string,
  body: any,
  errors: Map<number, string> = new Map()
): Promise<string[]> {
  const txnsToExec = await getAndSignRemoteTxns(provider, url, body);

  return executeTxnsInOrder(provider, txnsToExec, errors);
}

export async function signOnlyNeeded(
  provider: AnchorProvider,
  rawTxns: Buffer[]
): Promise<Buffer[]> {
  const txns = rawTxns.map((t) => Transaction.from(t));
  const needToSign = txns.filter((tx) =>
    tx.signatures.some((sig) => sig.publicKey.equals(provider.wallet.publicKey))
  );
  const signedTxns = await provider.wallet.signAllTransactions(needToSign);
  const txnsToExec = txns.map((txn, idx) => {
    const index = needToSign.indexOf(txn);
    if (index >= 0) {
      return signedTxns[index].serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
    }

    return Buffer.from(rawTxns[idx]);
  });

  return txnsToExec;
}

export async function executeTxnsInOrder(
  provider: Provider,
  txns: Buffer[],
  errors: Map<number, string> = new Map()
): Promise<string[]> {
  try {
    return [
      ...(await promiseAllInOrder(
        txns.map((txn) => async () => {
          const { txid } = await sendAndConfirmWithRetry(provider.connection, txn, {
            skipPreflight: true,
          }, "confirmed");

          return txid;
        })
      )),
    ];
  } catch (e: any) {
    const wrappedE = ProgramError.parse(e, errors);
    throw wrappedE == null ? e : wrappedE;
  }
}

/**
 * Get and sign transactions from a remote server (either single or multiple transactions)
 * @param provider
 * @param url
 * @param body
 * @param errors
 * @returns
 */
export async function getAndSignRemoteTxns(
  provider: AnchorProvider,
  url: string,
  body: any
): Promise<Buffer[]> {
  try {
    const resp = await axios.post(url, body, {
      responseType: "json",
    });
    const rawTxns = Array.isArray(resp.data) ? resp.data : [resp.data];
    return await signOnlyNeeded(
      provider,
      rawTxns.map((t) => t.data as Buffer)
    );
  } catch (e: any) {
    if (e.response?.data?.message) {
      throw new Error(e.response.data.message);
    }
    throw e;
  }
}
