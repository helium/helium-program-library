import { Connection } from "@solana/web3.js";
import { env } from "../env";
import WalletHistory from "../models/wallet-history";
import WalletHistoryCursor from "../models/wallet-history-cursor";
import PendingTransaction from "../models/pending-transaction";
import { fetchWalletTransactions } from "./helius";
import { classifyTransaction } from "./transaction-classifier";

const MAX_INITIAL_PAGES = 10;
const PAGE_SIZE = 100;

export async function syncWalletHistory(wallet: string): Promise<void> {
  const connection = new Connection(env.SOLANA_RPC_URL);
  const cursor = await WalletHistoryCursor.findByPk(wallet);
  const hasCursor = !!cursor;

  let paginationToken: string | undefined;
  let pagesRemaining = hasCursor ? Infinity : MAX_INITIAL_PAGES;
  let newestSignature: string | undefined;
  let newestSlot: number | undefined;
  let done = false;

  while (pagesRemaining > 0 && !done) {
    let result;
    try {
      result = await fetchWalletTransactions(wallet, {
        paginationToken,
        limit: PAGE_SIZE,
      });
    } catch (error) {
      console.error(`Failed to fetch wallet history for ${wallet}:`, error);
      return;
    }

    const { transactions, paginationToken: nextToken } = result;

    if (transactions.length === 0) {
      break;
    }

    for (const tx of transactions) {
      // If we have a cursor and encounter a signature we've already seen, stop
      if (hasCursor && tx.signature === cursor.lastSignature) {
        done = true;
        break;
      }

      // Track newest for cursor update
      if (!newestSignature) {
        newestSignature = tx.signature;
        newestSlot = tx.slot;
      }

      // Skip if this signature already exists in pending_transactions (blockchain-api source)
      const existingPending = await PendingTransaction.findOne({
        where: { signature: tx.signature },
        attributes: ["id"],
      });
      if (existingPending) {
        continue;
      }

      // Classify using IDL-based decoding
      const classified = await classifyTransaction(tx, connection);
      if (!classified) {
        continue;
      }

      // Insert (ignore duplicates via unique constraint)
      try {
        await WalletHistory.findOrCreate({
          where: { signature: tx.signature },
          defaults: {
            wallet,
            signature: tx.signature,
            actionType: classified.actionType,
            actionMetadata: classified.actionMetadata,
            slot: tx.slot,
            timestamp: new Date((tx.blockTime ?? 0) * 1000),
          },
        });
      } catch (error) {
        // Unique constraint violation — already cached
        if (
          (error as { name?: string })?.name !==
          "SequelizeUniqueConstraintError"
        ) {
          console.error(
            `Failed to insert wallet history for ${tx.signature}:`,
            error,
          );
        }
      }
    }

    paginationToken = nextToken ?? undefined;
    if (!paginationToken) break;
    pagesRemaining--;
  }

  // Update cursor
  if (newestSignature && newestSlot !== undefined) {
    await WalletHistoryCursor.upsert({
      wallet,
      lastSignature: newestSignature,
      lastSlot: newestSlot,
      updatedAt: new Date(),
    });
  }
}
