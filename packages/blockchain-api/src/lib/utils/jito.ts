import {
  Connection,
  SystemProgram,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { populateMissingDraftInfo, toVersionedTx } from "@helium/spl-utils";
import { env } from "../env";
import { classifyBundleSimulationFailure } from "./simulation-classifier";
import { getChewingGlassExplorerUrl, getExplorerUrl } from "./explorer";
import { createTtlCache } from "./ttl-cache";

export function shouldUseJitoBundle(
  transactionsLength: number,
  cluster: string,
): boolean {
  return (
    (cluster === "mainnet" || cluster === "mainnet-beta") &&
    transactionsLength > 1
  );
}

export async function jitoBlockEngineRequest(
  method: string,
  params: unknown[],
): Promise<Response> {
  return fetch(`${env.JITO_BLOCK_ENGINE_URL}/api/v1/bundles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.JITO_API_KEY && { "x-jito-auth": env.JITO_API_KEY }),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });
}

async function jitoRpcRequest(
  method: string,
  params: unknown[],
): Promise<Response> {
  return fetch(env.SOLANA_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });
}

// Tip account cache with TTL (5 minutes)
const TIP_ACCOUNTS_TTL_MS = 5 * 60 * 1000;
const tipAccountsCache = createTtlCache<string[]>({
  ttlMs: TIP_ACCOUNTS_TTL_MS,
});

async function fetchJitoTipAccounts(): Promise<string[]> {
  const response = await jitoBlockEngineRequest("getTipAccounts", []);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const result = await response.json();
  if (result.error) {
    throw new Error(result.error.message || JSON.stringify(result.error));
  }

  if (!Array.isArray(result.result) || result.result.length === 0) {
    throw new Error("Empty tip accounts response");
  }

  return result.result;
}

export function getJitoTipAccounts(): Promise<string[]> {
  return tipAccountsCache("tip-accounts", fetchJitoTipAccounts);
}

async function getJitoTipAccount(): Promise<string> {
  const tipAccounts = await getJitoTipAccounts();
  return tipAccounts[Math.floor(Math.random() * tipAccounts.length)];
}

async function resolveJitoTipAccount(): Promise<string> {
  try {
    return await getJitoTipAccount();
  } catch (error) {
    console.warn(
      `Failed to fetch Jito tip accounts, using fallback: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );

    if (!env.JITO_TIP_ACCOUNT) {
      throw new Error(
        "Failed to fetch Jito tip accounts and JITO_TIP_ACCOUNT fallback not configured",
      );
    }
    return env.JITO_TIP_ACCOUNT;
  }
}

export function getJitoTipAmountLamports(): number {
  return env.JITO_TIP_AMOUNT ? parseInt(env.JITO_TIP_AMOUNT) : 10000;
}

export async function getJitoTipInstruction(
  wallet: PublicKey,
): Promise<TransactionInstruction> {
  const tipAccount = await resolveJitoTipAccount();

  return SystemProgram.transfer({
    fromPubkey: wallet,
    toPubkey: new PublicKey(tipAccount),
    lamports: env.JITO_TIP_AMOUNT ? parseInt(env.JITO_TIP_AMOUNT) : 10000,
  });
}

export interface BundleSimulationErrorFields {
  category: string;
  actionType: string;
  detail: string;
  summary: string;
  transactionResults: Array<{
    logs?: string[];
    unitsConsumed?: number;
    err?: unknown;
  }>;
  explorerLinks: (string | null)[];
  chewingGlassExplorerLinks: (string | null)[];
  bundleSize: number;
  /** Index of the transaction that failed, if any transaction carried an error. */
  failedTransactionIndex?: number;
  /** Logs the failure is reported with: the failing transaction's own logs. */
  logs: string[];
  tag?: string;
  payer?: string;
  transactionMetadata?: Array<Record<string, unknown> | undefined>;
}

export class BundleSimulationError extends Error {
  public readonly logs: string[];
  public readonly category: string;
  public readonly actionType: string;
  public readonly detail: string;
  public readonly summary: string;
  public readonly transactionResults: BundleSimulationErrorFields["transactionResults"];
  public readonly explorerLinks: (string | null)[];
  public readonly chewingGlassExplorerLinks: (string | null)[];
  public readonly bundleSize: number;
  public readonly failedTransactionIndex?: number;
  public readonly tag?: string;
  public readonly payer?: string;
  public readonly transactionMetadata?: Array<
    Record<string, unknown> | undefined
  >;

  constructor(fields: BundleSimulationErrorFields) {
    super(
      `Jito bundle simulation failed [${fields.category}] (${fields.actionType}): ${fields.detail}`,
    );
    this.name = "BundleSimulationError";
    this.category = fields.category;
    this.actionType = fields.actionType;
    this.detail = fields.detail;
    this.summary = fields.summary;
    this.transactionResults = fields.transactionResults;
    this.explorerLinks = fields.explorerLinks;
    this.chewingGlassExplorerLinks = fields.chewingGlassExplorerLinks;
    this.bundleSize = fields.bundleSize;
    this.failedTransactionIndex = fields.failedTransactionIndex;
    this.tag = fields.tag;
    this.payer = fields.payer;
    this.transactionMetadata = fields.transactionMetadata;
    this.logs = fields.logs;
  }
}

export class JitoBundleSubmissionError extends Error {
  public readonly explorerLinks: (string | null)[];
  public readonly chewingGlassExplorerLinks: (string | null)[];
  public readonly bundleSize: number;
  public readonly tag?: string;
  public readonly payer?: string;
  public readonly transactionMetadata?: Array<
    Record<string, unknown> | undefined
  >;

  constructor(
    message: string,
    fields: {
      explorerLinks: (string | null)[];
      chewingGlassExplorerLinks: (string | null)[];
      bundleSize: number;
      tag?: string;
      payer?: string;
      transactionMetadata?: Array<Record<string, unknown> | undefined>;
    },
    cause?: unknown,
  ) {
    super(message);
    this.name = "JitoBundleSubmissionError";
    this.explorerLinks = fields.explorerLinks;
    this.chewingGlassExplorerLinks = fields.chewingGlassExplorerLinks;
    this.bundleSize = fields.bundleSize;
    this.tag = fields.tag;
    this.payer = fields.payer;
    this.transactionMetadata = fields.transactionMetadata;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

export interface JitoBundleContext {
  tag?: string;
  payer?: string;
  transactionMetadata?: Array<Record<string, unknown> | undefined>;
}

function stringifySummary(summary: unknown): string {
  if (typeof summary === "string") return summary;
  try {
    return JSON.stringify(summary);
  } catch {
    return String(summary);
  }
}

/**
 * Derive the action type from the bundle's transaction metadata
 * (e.g. "claim_rewards", "position_create", "mint_data_credits").
 */
function deriveActionType(context?: JitoBundleContext): string {
  const meta = context?.transactionMetadata;
  if (!meta) return "unknown";
  const firstReal = meta.find((m) => m && m.type && m.type !== "jito_tip");
  return (firstReal?.type as string) ?? "unknown";
}

export async function simulateJitoBundle(
  serializedTransactions: string[],
  context?: JitoBundleContext,
): Promise<void> {
  const deserializedTxs = serializedTransactions.map((tx) =>
    VersionedTransaction.deserialize(Buffer.from(tx, "base64")),
  );
  const base64Txs = deserializedTxs.map((transaction) =>
    Buffer.from(transaction.serialize()).toString("base64"),
  );

  const nullConfigs = base64Txs.map(() => null);
  const response = await jitoRpcRequest("simulateBundle", [
    { encodedTransactions: base64Txs },
    {
      preExecutionAccountsConfigs: nullConfigs,
      postExecutionAccountsConfigs: nullConfigs,
      transactionEncoding: "base64",
      skipSigVerify: true,
      replaceRecentBlockhash: true,
    },
  ]);

  type SimulationResult = {
    summary: unknown;
    transactionResults: Array<{
      logs?: string[];
      unitsConsumed?: number;
      err?: unknown;
    }>;
  };

  const rpcResponse: {
    error?: { code?: number; message?: string };
    result?: SimulationResult | { context: unknown; value: SimulationResult };
  } = await response.json();

  if (!response.ok) {
    throw new Error(
      `simulateBundle HTTP ${response.status}: ${JSON.stringify(rpcResponse)}`,
    );
  }

  if (rpcResponse.error) {
    throw new Error(
      `simulateBundle RPC error: ${
        rpcResponse.error.message || JSON.stringify(rpcResponse.error)
      }`,
    );
  }

  const simulation: SimulationResult | undefined =
    rpcResponse.result && "value" in rpcResponse.result
      ? rpcResponse.result.value
      : (rpcResponse.result as SimulationResult | undefined);

  if (simulation && simulation.summary !== "succeeded") {
    const summaryStr = stringifySummary(simulation.summary);
    // Drop pre/postExecutionAccounts: we requested null configs, so these are
    // noise that just clutters Sentry's normalized depth budget.
    const txResults = simulation.transactionResults.map((r) => {
      const {
        preExecutionAccounts: _pre,
        postExecutionAccounts: _post,
        ...rest
      } = r as Record<string, unknown>;
      return rest as typeof r;
    });
    const { category, detail, failedTransactionIndex, logs } =
      classifyBundleSimulationFailure(txResults);
    const actionType = deriveActionType(context);

    console.error(
      `[simulateBundle] Bundle simulation failed: ${summaryStr}\n` +
        `Category: ${category} | Action: ${actionType}\n` +
        `Failed transaction: ${failedTransactionIndex ?? "unknown"}\n` +
        `Bundle size: ${serializedTransactions.length}\n` +
        `Transaction results:\n` +
        txResults
          .map(
            (r, i) =>
              `  tx[${i}]: error=${JSON.stringify(r.err ?? null)}, ` +
              `unitsConsumed=${r.unitsConsumed ?? "N/A"}\n` +
              (r.logs ?? []).map((l) => `    ${l}`).join("\n"),
          )
          .join("\n"),
    );

    throw new BundleSimulationError({
      category,
      actionType,
      detail,
      summary: summaryStr,
      transactionResults: txResults,
      failedTransactionIndex,
      logs,
      explorerLinks: deserializedTxs.map((tx) => {
        try {
          return getExplorerUrl(tx);
        } catch {
          return null;
        }
      }),
      chewingGlassExplorerLinks: deserializedTxs.map((tx) => {
        try {
          return getChewingGlassExplorerUrl(tx);
        } catch {
          return null;
        }
      }),
      bundleSize: serializedTransactions.length,
      tag: context?.tag,
      payer: context?.payer,
      transactionMetadata: context?.transactionMetadata,
    });
  }
}

export async function submitJitoBundle(
  serializedTransactions: string[],
  context?: JitoBundleContext,
): Promise<string> {
  const deserializedTxs = serializedTransactions.map((tx) =>
    VersionedTransaction.deserialize(Buffer.from(tx, "base64")),
  );
  const transactions = deserializedTxs.map((transaction) =>
    Buffer.from(transaction.serialize()).toString("base64"),
  );

  try {
    const response = await jitoBlockEngineRequest("sendBundle", [
      transactions,
      { encoding: "base64" },
    ]);

    if (!response.ok) {
      throw new Error(
        `HTTP error! status: ${response.status}: ${JSON.stringify(
          await response.json(),
        )}`,
      );
    }

    const result = await response.json();

    if (result.error) {
      throw new Error(
        `Jito API error: ${
          result.error.message || JSON.stringify(result.error)
        }`,
      );
    }

    return result.result;
  } catch (error) {
    console.error(
      `Jito bundle submission failed (tag=${context?.tag ?? "none"}):`,
      error,
    );

    throw new JitoBundleSubmissionError(
      `Jito bundle submission failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      {
        explorerLinks: deserializedTxs.map((tx) => {
          try {
            return getExplorerUrl(tx);
          } catch {
            return null;
          }
        }),
        chewingGlassExplorerLinks: deserializedTxs.map((tx) => {
          try {
            return getChewingGlassExplorerUrl(tx);
          } catch {
            return null;
          }
        }),
        bundleSize: serializedTransactions.length,
        tag: context?.tag,
        payer: context?.payer,
        transactionMetadata: context?.transactionMetadata,
      },
      error,
    );
  }
}

export async function getJitoTipTransaction(
  wallet: PublicKey,
  // The blockhash the rest of the bundle was built on. Passing it saves a
  // round trip and keeps the tip's expiry in step with the bundle it tips.
  recentBlockhash?: string,
): Promise<VersionedTransaction> {
  const tipAccount = await resolveJitoTipAccount();

  return toVersionedTx(
    await populateMissingDraftInfo(
      new Connection(env.SOLANA_RPC_URL),
      {
        instructions: [
          SystemProgram.transfer({
            fromPubkey: wallet,
            toPubkey: new PublicKey(tipAccount),
            lamports: env.JITO_TIP_AMOUNT
              ? parseInt(env.JITO_TIP_AMOUNT)
              : 10000,
          }),
        ],
        feePayer: wallet,
        recentBlockhash,
      },
      "finalized",
    ),
  );
}

export const JITO_TIP_METADATA = {
  type: "jito_tip",
  description: "Jito bundle tip",
};

/**
 * Serialize transactions into {serializedTransaction, metadata} entries,
 * labeling the appended tip transaction (always last when hasTip) with
 * jito_tip metadata so isBundleLanded/deriveActionType can exclude it.
 */
export function serializeWithTipMetadata<M>(
  transactions: VersionedTransaction[],
  metadata: M,
  hasTip: boolean,
): Array<{
  serializedTransaction: string;
  metadata: M | typeof JITO_TIP_METADATA;
}> {
  return transactions.map((tx, i) => ({
    serializedTransaction: Buffer.from(tx.serialize()).toString("base64"),
    metadata:
      hasTip && i === transactions.length - 1 ? JITO_TIP_METADATA : metadata,
  }));
}
