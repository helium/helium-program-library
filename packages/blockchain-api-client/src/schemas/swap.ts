import { z } from "zod";
import { TransactionDataSchema } from "./common";

export const GetTokensInputSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const GetQuoteInputSchema = z
  .object({
    inputMint: z.string().min(1),
    outputMint: z.string().min(1),
    amount: z.string().min(1),
    swapMode: z.enum(["ExactIn", "ExactOut"]).default("ExactIn"),
    slippageBps: z.coerce.number().min(0).max(10000).default(50),
  })
  // A quote from a mint to itself is circular arbitrage, which Jupiter refuses
  // with CIRCULAR_ARBITRAGE_IS_DISABLED. Reject it here so the caller gets a
  // 400 instead of a Jupiter error surfaced as a 500.
  .refine((input) => input.inputMint !== input.outputMint, {
    message: "inputMint and outputMint must be different",
    path: ["outputMint"],
  });

export const QuoteResponseSchema = z
  .object({
    inputMint: z.string(),
    inAmount: z.string(),
    outputMint: z.string(),
    outAmount: z.string(),
    otherAmountThreshold: z.string(),
    swapMode: z.string(),
    slippageBps: z.number(),
    platformFee: z.unknown().optional(),
    priceImpactPct: z.string(),
    routePlan: z.array(z.unknown()),
    contextSlot: z.number().optional(),
    timeTaken: z.number().optional(),
  })
  .passthrough();

export const GetInstructionsInputSchema = z.object({
  quoteResponse: QuoteResponseSchema,
  userPublicKey: z.string().min(1),
  destinationTokenAccount: z.string().optional(),
  dynamicComputeUnitLimit: z.boolean().default(true),
  prioritizationFeeLamports: z
    .object({
      priorityLevelWithMaxLamports: z.object({
        maxLamports: z.number().default(1000000),
        priorityLevel: z.enum(["low", "medium", "high"]).default("medium"),
      }),
    })
    .optional(),
});

export const TokenSchema = z.object({
  address: z.string(),
  symbol: z.string(),
  name: z.string(),
  decimals: z.number(),
  logoURI: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const TokenListOutputSchema = z.object({
  tokens: z.array(TokenSchema),
});

export const SwapTransactionDataSchema = TransactionDataSchema;

export type GetTokensInput = z.infer<typeof GetTokensInputSchema>;
export type GetQuoteInput = z.infer<typeof GetQuoteInputSchema>;
export type GetInstructionsInput = z.infer<typeof GetInstructionsInputSchema>;
export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;
export type Token = z.infer<typeof TokenSchema>;
export type TokenListOutput = z.infer<typeof TokenListOutputSchema>;
