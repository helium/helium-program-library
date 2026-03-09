"use client";

import React, {
  createContext,
  useContext,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BatchStatus } from "@/lib/models/transaction-batch";
import { useAsyncCallback } from "react-async-hook";
import { useQuery } from "@tanstack/react-query";
import {
  fetchPendingTransactions,
  fetchTransactionStatus,
} from "@/lib/queries/transactions";

export interface PendingTransactionInfo {
  batchId: string;
  tag: string;
  type: string;
  description: string;
  createdAt: string;
  status: BatchStatus;
  transactionCount: number;
  transactions: Array<{
    type: string;
    description: string;
  }>;
}

const POLLING_INTERVAL = 3000; // 3 seconds

// Global callback registry for transaction success
const successCallbacks = new Map<
  string,
  (batchId: string, signatures: string[]) => void
>();

interface TransactionContextType {
  pendingTransactions: PendingTransactionInfo[];
  isPolling: boolean;
  addTransaction: (transaction: PendingTransactionInfo) => void;
  refreshPending: () => void;
  registerSuccessCallback: (
    batchId: string,
    callback: (batchId: string, signatures: string[]) => void,
  ) => void;
}

const TransactionContext = createContext<TransactionContextType | null>(null);

export function TransactionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = usePrivy();
  const queryClient = useQueryClient();
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const toastIdRef = useRef<string | number | null>(null);

  // Fetch pending transactions using react-query - only on first load
  const {
    data: pendingTransactions = [],
    isLoading: isLoadingTransactions,
    refetch: refetchPending,
  } = useQuery({
    queryKey: ["pendingTransactions", user?.wallet?.address],
    queryFn: async () => {
      if (!user?.wallet?.address) return [];
      return fetchPendingTransactions(user.wallet.address);
    },
    enabled: !!user?.wallet?.address,
    staleTime: Infinity, // Don't refetch automatically
  });

  // Check for completed transactions
  const checkForCompletedTransactions = useAsyncCallback(
    async (currentTransactions: PendingTransactionInfo[]) => {
      if (currentTransactions.length === 0) return;
      let hasCompletedTransactions = false;
      const completedBatchIds: string[] = [];

      for (const tx of currentTransactions) {
        try {
          const batchStatus = await fetchTransactionStatus(tx.batchId);
          if (batchStatus.status === "confirmed") {
            toast.success(`${tx.description} completed!`, { duration: 3000 });
            const callback = successCallbacks.get(tx.batchId);
            if (callback) {
              const signatures =
                batchStatus.transactions?.map((t: any) => t.signature) || [];
              callback(tx.batchId, signatures);
              successCallbacks.delete(tx.batchId);
            }
            completedBatchIds.push(tx.batchId);
            hasCompletedTransactions = true;
          } else if (
            batchStatus.status === "failed" ||
            batchStatus.status === "expired"
          ) {
            console.error(
              `Transaction ${tx.batchId} failed: ${batchStatus.status}`,
            );
            toast.error(`${tx.description} failed`, { duration: 3000 });
            completedBatchIds.push(tx.batchId);
            hasCompletedTransactions = true;
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes("Transaction")) {
            console.error(`Transaction ${tx.batchId} failed:`, error);
            toast.error(`${tx.description} failed`, { duration: 3000 });
            completedBatchIds.push(tx.batchId);
            hasCompletedTransactions = true;
          } else {
            console.warn(`Error checking transaction ${tx.batchId}:`, error);
          }
        }
      }

      // Only invalidate once if we have completed transactions
      if (hasCompletedTransactions) {
        queryClient.invalidateQueries({
          queryKey: ["pendingTransactions", user?.wallet?.address],
        });
      }
    },
  );

  // Update the persistent toast
  const updateToast = useCallback((transactions: PendingTransactionInfo[]) => {
    if (transactions.length === 0) {
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
        toastIdRef.current = null;
      }
      return;
    }

    const content = (
      <div className="w-full">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">
            {transactions.length} transaction
            {transactions.length > 1 ? "s" : ""} in progress
          </span>
          <div className="flex space-x-1">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
        </div>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {transactions.map((tx) => (
            <div key={tx.batchId} className="text-xs text-gray-300">
              <div className="flex justify-between mb-1">
                <span className="truncate max-w-[200px] font-medium">
                  {tx.transactionCount > 1
                    ? `${tx.transactionCount} transactions`
                    : tx.description}
                </span>
                <span className="text-blue-300 ml-2 flex-shrink-0">
                  {tx.status}
                </span>
              </div>
              {tx.transactionCount > 1 && (
                <div className="space-y-0.5 ml-2">
                  {tx.transactions.map((subTx, index) => (
                    <div key={index} className="text-gray-400 truncate">
                      • {subTx.description}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );

    if (toastIdRef.current) {
      toast.loading(content, { id: toastIdRef.current });
    } else {
      toastIdRef.current = toast.loading(content, {
        duration: Infinity,
        style: {
          background: "#1f2937",
          color: "#f9fafb",
          border: "1px solid #374151",
        },
      });
    }
  }, []);

  // Add a new transaction to tracking
  const addTransaction = useCallback(
    (transaction: PendingTransactionInfo) => {
      // Add to react-query cache optimistically
      queryClient.setQueryData(
        ["pendingTransactions", user?.wallet?.address],
        (oldData: PendingTransactionInfo[] = []) => {
          const exists = oldData.find(
            (tx) => tx.batchId === transaction.batchId,
          );
          if (exists) return oldData;
          return [...oldData, transaction];
        },
      );
    },
    [queryClient, user?.wallet?.address],
  );

  // Update toast whenever pending transactions change
  useEffect(() => {
    updateToast(pendingTransactions);
  }, [pendingTransactions, updateToast]);

  // Check for completed transactions periodically
  useEffect(() => {
    const userAddress = user?.wallet?.address;

    // Don't start polling if we don't have a user or pending transactions
    if (!userAddress || pendingTransactions.length === 0) {
      // Clear any existing interval
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    // Only start polling if we don't already have an interval running
    if (!pollingIntervalRef.current) {
      pollingIntervalRef.current = setInterval(async () => {
        try {
          // Get fresh data to avoid polling stale transactions
          const freshData = queryClient.getQueryData([
            "pendingTransactions",
            userAddress,
          ]) as PendingTransactionInfo[];
          if (freshData && freshData.length > 0) {
            await checkForCompletedTransactions.execute(freshData);
          } else {
            // No more pending transactions, stop polling
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
          }
        } catch (error) {
          console.error("Error in polling interval:", error);
          // On error, stop polling to prevent spam
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        }
      }, POLLING_INTERVAL); // Check completion every 3 seconds
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [
    user?.wallet?.address,
    pendingTransactions.length,
    checkForCompletedTransactions,
    queryClient,
  ]);

  // Clean up toast when user disconnects
  useEffect(() => {
    if (!user?.wallet?.address) {
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
        toastIdRef.current = null;
      }
      // Also clear any polling interval when user disconnects
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
  }, [user?.wallet?.address]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
        toastIdRef.current = null;
      }
    };
  }, []);

  // Function to register a success callback for a batch ID
  const registerSuccessCallback = useCallback(
    (
      batchId: string,
      callback: (batchId: string, signatures: string[]) => void,
    ) => {
      successCallbacks.set(batchId, callback);
    },
    [],
  );

  const contextValue: TransactionContextType = {
    pendingTransactions,
    isPolling: isLoadingTransactions || checkForCompletedTransactions.loading,
    addTransaction,
    refreshPending: refetchPending,
    registerSuccessCallback,
  };

  return (
    <TransactionContext.Provider value={contextValue}>
      {children}
    </TransactionContext.Provider>
  );
}

export function useTransactionContext() {
  const context = useContext(TransactionContext);
  if (!context) {
    throw new Error(
      "useTransactionContext must be used within a TransactionProvider",
    );
  }
  return context;
}
