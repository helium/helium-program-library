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
  jitoBlockEngineRequest,
} from "./jito";

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
  // When true, the top-level handler should not capture this to Sentry —
  // this is used for expected, user-facing errors (e.g. stale wallet versions).
  public readonly skipSentry: boolean;

  constructor(
    message: string,
    fields: { bundleSize: number; skipSentry: boolean },
  ) {
    super(message);
    this.name = "JitoMissingTipError";
    this.bundleSize = fields.bundleSize;
    this.skipSentry = fields.skipSentry;
  }
}

let cachedTipAccountSet: Set<string> | null = null;
let tipAccountSetCachedAt = 0;
const TIP_ACCOUNTS_TTL_MS = 5 * 60 * 1000;

/**
 * Verify that a bundle contains at least one transaction that write-locks
 * a Jito tip account. Throws if no tip is found — this should never happen
 * since all server-crafted bundles include a tip transaction.
 */
async function requireBundleHasTipAccount(
  serializedTransactions: string[],
  tag?: string,
): Promise<void> {
  if (
    !cachedTipAccountSet ||
    Date.now() - tipAccountSetCachedAt > TIP_ACCOUNTS_TTL_MS
  ) {
    const response = await jitoBlockEngineRequest("getTipAccounts", []);
    if (response.ok) {
      const result = await response.json();
      if (Array.isArray(result.result) && result.result.length > 0) {
        cachedTipAccountSet = new Set(result.result as string[]);
        tipAccountSetCachedAt = Date.now();
      }
    }
  }

  if (!cachedTipAccountSet || cachedTipAccountSet.size === 0) {
    // Can't validate — allow submission and let Jito reject if needed
    return;
  }

  for (const serialized of serializedTransactions) {
    const tx = VersionedTransaction.deserialize(
      Buffer.from(serialized, "base64"),
    );
    const keys = tx.message.staticAccountKeys;
    const { numRequiredSignatures, numReadonlySignedAccounts, numReadonlyUnsignedAccounts } = tx.message.header;
    const writableSignedCount = numRequiredSignatures - numReadonlySignedAccounts;
    const unsignedStart = numRequiredSignatures;
    const writableUnsignedCount = keys.length - numRequiredSignatures - numReadonlyUnsignedAccounts;

    for (let i = 0; i < writableSignedCount; i++) {
      if (cachedTipAccountSet.has(keys[i].toBase58())) return;
    }
    for (let i = 0; i < writableUnsignedCount; i++) {
      if (cachedTipAccountSet.has(keys[unsignedStart + i].toBase58())) return;
    }
  }

  const isFriendlyUpgradeError =
    tag?.includes("implicit-burn") || tag?.includes("claim-rewards");

  throw new JitoMissingTipError(
    isFriendlyUpgradeError
      ? "Bundle missing Jito tip. Please upgrade your Helium Wallet app and try again."
      : "Jito bundle is missing a tip transaction — no transaction write-locks a recognized tip account",
    {
      bundleSize: serializedTransactions.length,
      skipSentry: Boolean(isFriendlyUpgradeError),
    },
  );
}

function isBlockhashNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Blockhash not found") || message.includes("blockhash not found");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

    // Multiple transactions
    if (shouldUseJitoBundle(payload.transactions.length, cluster)) {
      // Mainnet: use Jito bundle — verify tip is present before submitting
      await requireBundleHasTipAccount(payload.transactions, payload.tag);
      await simulateJitoBundle(payload.transactions, bundleContext);

      const jitoBundleId = await submitJitoBundle(payload.transactions, bundleContext);
      return {
        batchId,
        submissionType: "jito_bundle",
        jitoBundleId,
        signatures: payload.transactions.map((tx) =>
          bs58.encode(
            VersionedTransaction.deserialize(Buffer.from(tx, "base64"))
              .signatures[0],
          ),
        ),
      };
    } else {
      // Devnet/Localnet: use parallel or sequential based on payload.parallel
      if (payload.parallel) {
        const signatures = await submitTransactionsParallel(
          connection,
          payload.transactions,
        );
        return {
          batchId,
          submissionType: "parallel",
          signatures,
        };
      } else {
        const signatures = await submitTransactionsSequential(
          connection,
          payload.transactions,
        );
        return {
          batchId,
          submissionType: "sequential",
          signatures,
        };
      }
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
          `[submitTransactionBatch] Blockhash not found, retrying after 2s (attempt ${i + 1}/${MAX_BLOCKHASH_RETRIES})...`,
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
