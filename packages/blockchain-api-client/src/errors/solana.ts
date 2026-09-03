import { z } from "zod";

/** Insufficient Solana balance error */
export const INSUFFICIENT_FUNDS = {
  status: 400,
  message: "Insufficient SOL balance to complete this transaction.",
  data: z.object({
    required: z.number(),
    available: z.number(),
  }),
} as const;

/** Solana transaction failed error */
export const TRANSACTION_FAILED = {
  status: 500,
  message: "Transaction failed to execute.",
  data: z.object({
    logs: z.array(z.string()).optional(),
    signature: z.string().optional(),
  }),
} as const;

/**
 * A submitted transaction carries a blockhash the cluster no longer accepts,
 * so it can never land. Distinct from a generic bad request: the client has to
 * rebuild the transaction on a fresh blockhash and have it signed again.
 */
export const BLOCKHASH_EXPIRED = {
  status: 400,
  message:
    "Transaction blockhash has expired. Rebuild the transaction and sign it again.",
  data: z.object({
    /** The expired blockhash. */
    blockhash: z.string().optional(),
    /** Index in the submitted batch of the transaction that carries it. */
    failedTransactionIndex: z.number().optional(),
  }),
} as const;

/** Transaction simulation failed error */
export const SIMULATION_FAILED = {
  status: 400,
  message: "Transaction simulation failed.",
  data: z.object({
    logs: z.array(z.string()).optional(),
    link: z.string().optional(),
    /** Index in the submitted batch of the transaction that failed to simulate. */
    failedTransactionIndex: z.number().optional(),
  }),
} as const;
