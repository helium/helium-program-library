import { Connection, VersionedTransaction } from "@solana/web3.js";
import { env } from "../env";
import { v4 as uuidv4 } from "uuid";
import bs58 from "bs58";
import { getChewingGlassExplorerUrl, getExplorerUrl } from "./explorer";
import { getCluster } from "../solana";
import {
  shouldUseJitoBundle,
  simulateJitoBundle,
  submitJitoBundle,
  JitoBundleContext,
  getJitoTipAccounts,
} from "./jito";
import { isBundleLanded, isClientCraftedBundleTag } from "./submission-helpers";

export class SingleTransactionSubmissionError extends Error {
  public readonly explorerLink: string | null;
  public readonly chewingGlassExplorerLink: string | null;

  constructor(
    message: string,
    fields: {
      explorerLink: string | null;
      chewingGlassExplorerLink: string | null;
    },
    cause?: unknown,
  ) {
    super(message);
    this.name = "SingleTransactionSubmissionError";
    this.explorerLink = fields.explorerLink;
    this.chewingGlassExplorerLink = fields.chewingGlassExplorerLink;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

export class JitoMissingTipError extends Error {
  public readonly bundleSize: number;

  constructor(message: string, fields: { bundleSize: number }) {
    super(message);
    this.name = "JitoMissingTipError";
    this.bundleSize = fields.bundleSize;
  }
}

/**
 * Whether the bundle contains at least one transaction that write-locks a
 * Jito tip account. Only static account keys are checked (Jito tip transfers
 * never use lookup tables). Returns true when validation is impossible (tip
 * accounts unavailable) so submission proceeds and Jito rejects if needed.
 */
async function bundleHasTipAccount(
  transactions: VersionedTransaction[],
): Promise<boolean> {
  let tipAccounts: Set<string>;
  try {
    tipAccounts = new Set(await getJitoTipAccounts());
  } catch (error) {
    console.warn(
      "[bundleHasTipAccount] Failed to fetch Jito tip accounts:",
      error,
    );
    return true;
  }

  return transactions.some(({ message }) =>
    message.staticAccountKeys.some(
      (key, i) =>
        message.isAccountWritable(i) && tipAccounts.has(key.toBase58()),
    ),
  );
}

function isBlockhashNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Blockhash not found") ||
    message.includes("blockhash not found")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check whether the real (non-tip) transactions of a Jito bundle are already
 * confirmed on-chain. Lets us treat a bundle rejection (e.g. -32602 "already
 * processed transaction") as success when the transactions actually landed,
 * without coupling to Jito's error text.
 */
async function bundleTransactionsLanded(
  connection: Connection,
  signatures: string[],
  transactionMetadata?: Array<Record<string, unknown> | undefined>,
): Promise<boolean> {
  const { value } = await connection.getSignatureStatuses(signatures, {
    searchTransactionHistory: true,
  });

  return isBundleLanded(value, transactionMetadata);
}

export interface TransactionBatchPayload {
  parallel: boolean;
  transactions: string[];
  tag?: string;
  payer?: string;
  transactionMetadata?: Array<Record<string, unknown> | undefined>;
}

export interface BatchSubmissionResult {
  batchId: string;
  submissionType: "single" | "parallel" | "sequential" | "jito_bundle";
  signatures?: string[];
  jitoBundleId?: string;
}

// Submit single transaction
export async function submitSingleTransaction(
  connection: Connection,
  serializedTransaction: string,
): Promise<string> {
  const transaction = VersionedTransaction.deserialize(
    Buffer.from(serializedTransaction, "base64"),
  );

  try {
    return await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true,
    });
  } catch (error) {
    let explorerLink: string | null = null;
    let chewingGlassExplorerLink: string | null = null;
    try {
      explorerLink = getExplorerUrl(transaction);
      chewingGlassExplorerLink = getChewingGlassExplorerUrl(transaction);
    } catch {
      // ignore — links are best-effort
    }
    throw new SingleTransactionSubmissionError(
      error instanceof Error ? error.message : "Unknown error",
      { explorerLink, chewingGlassExplorerLink },
      error,
    );
  }
}

// Submit transactions in parallel
export async function submitTransactionsParallel(
  connection: Connection,
  serializedTransactions: string[],
): Promise<string[]> {
  const submissions = serializedTransactions.map(async (serializedTx) => {
    return await submitSingleTransaction(connection, serializedTx);
  });

  return await Promise.all(submissions);
}

// Submit transactions sequentially
export async function submitTransactionsSequential(
  connection: Connection,
  serializedTransactions: string[],
): Promise<string[]> {
  const signatures: string[] = [];

  for (const serializedTx of serializedTransactions) {
    const signature = await submitSingleTransaction(connection, serializedTx);
    signatures.push(signature);
  }

  return signatures;
}

// Main submission function that handles all types
export async function submitTransactionBatch(
  payload: TransactionBatchPayload,
): Promise<BatchSubmissionResult> {
  const batchId = uuidv4();
  const connection = new Connection(env.SOLANA_RPC_URL);
  const cluster = getCluster();
  const bundleContext: JitoBundleContext = {
    tag: payload.tag,
    payer: payload.payer,
    transactionMetadata: payload.transactionMetadata,
  };

  const attempt = async (): Promise<BatchSubmissionResult> => {
    // Single transaction case
    if (payload.transactions.length === 1) {
      const signature = await submitSingleTransaction(
        connection,
        payload.transactions[0],
      );
      return {
        batchId,
        submissionType: "single",
        signatures: [signature],
      };
    }

    // Submit each transaction directly via RPC, parallel or sequential based
    // on payload.parallel. Used on devnet/localnet, and as the mainnet
    // fallback for client-crafted bundles that lack a Jito tip.
    const submitViaRpc = async (): Promise<BatchSubmissionResult> => {
      if (payload.parallel) {
        const signatures = await submitTransactionsParallel(
          connection,
          payload.transactions,
        );
        return { batchId, submissionType: "parallel", signatures };
      }
      const signatures = await submitTransactionsSequential(
        connection,
        payload.transactions,
      );
      return { batchId, submissionType: "sequential", signatures };
    };

    // Multiple transactions
    if (shouldUseJitoBundle(payload.transactions.length, cluster)) {
      const bundleTransactions = payload.transactions.map((tx) =>
        VersionedTransaction.deserialize(Buffer.from(tx, "base64")),
      );

      // Mainnet: use Jito bundle — verify tip is present before submitting
      if (!(await bundleHasTipAccount(bundleTransactions))) {
        if (isClientCraftedBundleTag(payload.tag)) {
          // Stale wallet-app releases and third-party clients craft their own
          // transactions without a Jito tip. The transactions are still valid,
          // so submit them directly via RPC instead of failing the bundle.
          console.warn(
            `[submitTransactionBatch] Bundle tagged "${payload.tag}" has no Jito tip; falling back to direct RPC submission`,
          );
          return submitViaRpc();
        }
        throw new JitoMissingTipError(
          "Jito bundle is missing a tip transaction — no transaction write-locks a recognized tip account",
          { bundleSize: payload.transactions.length },
        );
      }
      await simulateJitoBundle(payload.transactions, bundleContext);

      const signatures = bundleTransactions.map((tx) =>
        bs58.encode(tx.signatures[0]),
      );

      try {
        const jitoBundleId = await submitJitoBundle(
          payload.transactions,
          bundleContext,
        );
        return {
          batchId,
          submissionType: "jito_bundle",
          jitoBundleId,
          signatures,
        };
      } catch (error) {
        // Jito rejects a bundle (e.g. -32602 "already processed transaction")
        // when a transaction in it has already landed. Trust the ledger, not the
        // error text: if the real (non-tip) transactions are confirmed on-chain,
        // the work succeeded and the rejection is moot.
        if (
          await bundleTransactionsLanded(
            connection,
            signatures,
            payload.transactionMetadata,
          )
        ) {
          return { batchId, submissionType: "jito_bundle", signatures };
        }
        throw error;
      }
    } else {
      return submitViaRpc();
    }
  };

  const MAX_BLOCKHASH_RETRIES = 3;
  let lastError: unknown;
  for (let i = 0; i <= MAX_BLOCKHASH_RETRIES; i++) {
    try {
      return await attempt();
    } catch (error) {
      if (
        isBlockhashNotFoundError(error) &&
        i < MAX_BLOCKHASH_RETRIES &&
        payload.transactions.length > 1
      ) {
        console.warn(
          `[submitTransactionBatch] Blockhash not found, retrying after 2s (attempt ${
            i + 1
          }/${MAX_BLOCKHASH_RETRIES})...`,
        );
        await sleep(2000);
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}
