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
    excludeDexes: z
      .string()
      .optional()
      .describe(
        "Comma-separated Jupiter DEX labels to leave out of the quoted route. It does not carry into getInstructions, which routes again: send the same excludeDexes to getInstructions to keep these DEXes out of the built swap.",
      ),
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
  quoteResponse: QuoteResponseSchema.describe(
    "A getQuote response. The swap is built for its inputMint, outputMint, inAmount and slippageBps; Jupiter quotes the route again, so the output amount can differ from this quote's outAmount; a built swap whose minimum output is below this quote's otherAmountThreshold is refused with JUPITER_ERROR. Only ExactIn quotes are accepted.",
  ),
  userPublicKey: z.string().min(1),
  destinationTokenAccount: z
    .string()
    .optional()
    .describe("SPL token account that receives the output tokens"),
  excludeDexes: z
    .string()
    .optional()
    .describe(
      "Comma-separated Jupiter DEX labels to leave out of the built route. getQuote's excludeDexes does not carry over, because building routes again: send it here too. A built route through a listed label (exact, case-sensitive match) is refused with JUPITER_ERROR.",
    ),
  dynamicComputeUnitLimit: z
    .boolean()
    .default(true)
    .describe(
      "Accepted for compatibility and ignored: the server sets the compute unit limit itself.",
    ),
  useSharedAccounts: z
    .boolean()
    .optional()
    .describe(
      "Accepted for compatibility and ignored: Jupiter's Swap V2 /build chooses whether the route uses shared program accounts and takes no option for it.",
    ),
  prioritizationFeeLamports: z
    .object({
      priorityLevelWithMaxLamports: z.object({
        maxLamports: z.number().default(1000000),
        priorityLevel: z.enum(["low", "medium", "high"]).default("medium"),
      }),
    })
    .optional()
    .describe(
      "Accepted for compatibility and ignored: the server sets the compute unit price itself.",
    ),
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
