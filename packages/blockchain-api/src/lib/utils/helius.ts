import { env } from "../env";
import type {
  VersionedTransactionResponse,
} from "@solana/web3.js";

export interface HeliusTransaction {
  signature: string;
  slot: number;
  blockTime: number | null;
  transaction: VersionedTransactionResponse["transaction"];
  meta: VersionedTransactionResponse["meta"];
}

export interface FetchResult {
  transactions: HeliusTransaction[];
  paginationToken: string | null;
}

/**
 * Fetch transactions for a wallet using Helius getTransactionsForAddress RPC method.
 * This is called on the existing SOLANA_RPC_URL which is already a Helius endpoint.
 */
export async function fetchWalletTransactions(
  wallet: string,
  options?: { paginationToken?: string; limit?: number },
): Promise<FetchResult> {
  const response = await fetch(env.SOLANA_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransactionsForAddress",
      params: [
        wallet,
        {
          transactionDetails: "full",
          encoding: "jsonParsed",
          maxSupportedTransactionVersion: 0,
          limit: options?.limit ?? 100,
          ...(options?.paginationToken
            ? { paginationToken: options.paginationToken }
            : {}),
          filters: {
            status: "succeeded",
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Helius RPC error (${response.status}):`, text);
    throw new Error(`Helius RPC error: ${response.status}`);
  }

  const json = await response.json();

  if (json.error) {
    console.error("Helius RPC error:", json.error);
    throw new Error(`Helius RPC error: ${json.error.message}`);
  }

  const result = json.result;
  const transactions: HeliusTransaction[] = (result.data || []).map(
    (item: any) => ({
      signature: item.transaction?.signatures?.[0] || "",
      slot: item.slot,
      blockTime: item.blockTime,
      transaction: item.transaction,
      meta: item.meta,
    }),
  );

  return {
    transactions,
    paginationToken: result.paginationToken || null,
  };
}
