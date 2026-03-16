"use client";

import { useTransactionContext } from "@/providers/TransactionProvider";

// Re-export the interface for backward compatibility
export type { PendingTransactionInfo } from "@/providers/TransactionProvider";

// Simple wrapper that uses the context
export function usePersistentTransactions() {
  return useTransactionContext();
}
