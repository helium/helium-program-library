import {
  Connection,
  SystemProgram,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { populateMissingDraftInfo, toVersionedTx } from "@helium/spl-utils";
import * as Sentry from "@sentry/nextjs";
import { env } from "../env";
import { classifySimulationLogs } from "./simulation-classifier";

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
let cachedTipAccounts: string[] | null = null;
let tipAccountsCachedAt = 0;

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

async function getJitoTipAccount(): Promise<string> {
  if (
    !cachedTipAccounts ||
    Date.now() - tipAccountsCachedAt > TIP_ACCOUNTS_TTL_MS
  ) {
    cachedTipAccounts = await fetchJitoTipAccounts();
    tipAccountsCachedAt = Date.now();
  }

  return cachedTipAccounts[
    Math.floor(Math.random() * cachedTipAccounts.length)
  ];
}

async function resolveJitoTipAccount(): Promise<string> {
  try {
    return await getJitoTipAccount();
  } catch (error) {
    console.warn(
      `Failed to fetch Jito tip accounts, using fallback: ${error instanceof Error ? error.message : "Unknown error"}`,
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

export class BundleSimulationError extends Error {
  public logs: string[];

  constructor(
    message: string,
    public transactionResults: Array<{
      logs?: string[];
      unitsConsumed?: number;
      err?: unknown;
    }>,
  ) {
    super(message);
    this.name = "BundleSimulationError";
    this.logs = transactionResults.flatMap((r) => r.logs ?? []);
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
 * Classify bundle simulation failure using the shared classifier.
 */
function classifyBundleSimulationFailure(
  txResults: Array<{ logs?: string[]; err?: unknown }>,
): { category: string; detail: string } {
  const allLogs = txResults.flatMap((r) => r.logs ?? []);
  const firstErr = txResults.find((r) => r.err);
  const errStr = firstErr?.err
    ? typeof firstErr.err === "string"
      ? firstErr.err
      : JSON.stringify(firstErr.err)
    : "";
  return classifySimulationLogs(errStr, allLogs);
}

/**
 * Derive the action type from the bundle's transaction metadata
 * (e.g. "claim_rewards", "position_create", "mint_data_credits").
 */
function deriveActionType(
  context?: JitoBundleContext,
): string {
  const meta = context?.transactionMetadata;
  if (!meta) return "unknown";
  const firstReal = meta.find(
    (m) => m && m.type && m.type !== "jito_tip",
  );
  return (firstReal?.type as string) ?? "unknown";
}

export async function simulateJitoBundle(
  serializedTransactions: string[],
  context?: JitoBundleContext,
): Promise<void> {
  const base64Txs = serializedTransactions.map((tx) => {
    const transaction = VersionedTransaction.deserialize(
      Buffer.from(tx, "base64"),
    );
    return Buffer.from(transaction.serialize()).toString("base64");
  });

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
      `simulateBundle RPC error: ${rpcResponse.error.message || JSON.stringify(rpcResponse.error)}`,
    );
  }

  const simulation: SimulationResult | undefined =
    rpcResponse.result && "value" in rpcResponse.result
      ? rpcResponse.result.value
      : (rpcResponse.result as SimulationResult | undefined);

  if (simulation && simulation.summary !== "succeeded") {
    const summaryStr = stringifySummary(simulation.summary);
    const txResults = simulation.transactionResults;
    const allLogs = txResults.flatMap((r) => r.logs ?? []);
    const { category, detail } = classifyBundleSimulationFailure(txResults);
    const actionType = deriveActionType(context);

    console.error(
      `[simulateBundle] Bundle simulation failed: ${summaryStr}\n` +
        `Category: ${category} | Action: ${actionType}\n` +
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

    const err = new BundleSimulationError(
      `Jito bundle simulation failed [${category}] (${actionType}): ${detail}`,
      txResults,
    );
    Sentry.captureException(err, {
      level: "error",
      fingerprint: [
        "jito_bundle_simulation_failed",
        category,
        actionType,
      ],
      tags: {
        error_type: "jito_bundle_simulation_failed",
        simulation_failure_category: category,
        action_type: actionType,
        tag: context?.tag,
      },
      extra: {
        summary: summaryStr,
        failure_detail: detail,
        transaction_results: txResults,
        logs: allLogs,
        bundle_size: serializedTransactions.length,
        tag: context?.tag,
        payer: context?.payer,
        transaction_metadata: context?.transactionMetadata,
      },
    });
    throw err;
  }
}

export async function submitJitoBundle(
  serializedTransactions: string[],
  context?: JitoBundleContext,
): Promise<string> {
  const transactions = serializedTransactions.map((tx) => {
    const transaction = VersionedTransaction.deserialize(
      Buffer.from(tx, "base64"),
    );
    return Buffer.from(transaction.serialize()).toString("base64");
  });

  try {
    const response = await jitoBlockEngineRequest("sendBundle", [
      transactions,
      { encoding: "base64" },
    ]);

    if (!response.ok) {
      throw new Error(
        `HTTP error! status: ${response.status}: ${JSON.stringify(await response.json())}`,
      );
    }

    const result = await response.json();

    if (result.error) {
      throw new Error(
        `Jito API error: ${result.error.message || JSON.stringify(result.error)}`,
      );
    }

    return result.result;
  } catch (error) {
    console.error("Jito bundle submission failed:", error);

    Sentry.captureException(error, {
      level: "error",
      tags: {
        error_type: "jito_bundle_submission_failed",
        submission_type: "jito_bundle",
        tag: context?.tag,
      },
      extra: {
        error_message: error instanceof Error ? error.message : "Unknown error",
        bundle_size: serializedTransactions.length,
        jito_block_engine_url: env.JITO_BLOCK_ENGINE_URL,
        tag: context?.tag,
        payer: context?.payer,
        transaction_metadata: context?.transactionMetadata,
      },
    });

    throw error;
  }
}

export async function getJitoTipTransaction(
  wallet: PublicKey,
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
      },
      "finalized",
    ),
  );
}
