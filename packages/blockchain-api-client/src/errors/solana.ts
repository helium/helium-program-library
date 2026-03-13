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

/** Transaction simulation failed error */
export const SIMULATION_FAILED = {
  status: 400,
  message: "Transaction simulation failed.",
  data: z.object({
    logs: z.array(z.string()).optional(),
    link: z.string().optional(),
  }),
} as const;
