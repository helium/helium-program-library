import { z } from "zod";

/**
 * Metadata associated with a transaction for tracking and display purposes.
 */
export const TransactionMetadataSchema = z
  .object({
    type: z.string(),
    description: z.string(),
  })
  .catchall(z.unknown());

/**
 * A single transaction item with serialized data and optional metadata.
 */
export const TransactionItemSchema = z.object({
  serializedTransaction: z.string(),
  metadata: TransactionMetadataSchema.optional(),
});

/**
 * Transaction data returned by procedures that create transactions.
 * Contains serialized transactions ready for signing and submission.
 */
export const TransactionDataSchema = z.object({
  transactions: z.array(TransactionItemSchema),
  parallel: z.boolean(),
  tag: z.string().optional(),
});

/**
 * Request schema for submitting a batch of transactions.
 */
export const TransactionBatchRequestSchema = z.object({
  transactions: z.array(TransactionItemSchema),
  parallel: z.boolean(),
  tag: z.string().optional(),
});

/**
 * Response schema for transaction batch submission.
 */
export const TransactionBatchResponseSchema = z.object({
  batchId: z.string(),
  message: z.string().optional(),
});

/**
 * Standard error response schema.
 */
export const ErrorResponseSchema = z.object({
  error: z.string(),
  details: z.array(z.string()).optional(),
});

/**
 * Solana wallet address validation.
 */
export const WalletAddressSchema = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Invalid Solana wallet address");

/**
 * Solana public key validation (base58 encoded).
 */
export const PublicKeySchema = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Invalid Solana public key");

/**
 * Helium public key validation.
 */
// TODO: Better validation?
export const HeliumPublicKeySchema = z.string().min(32).max(400);

/**
 * Standard pagination input schema.
 */
export const PaginationInputSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

/**
 * Standard pagination output schema.
 */
export const PaginationOutputSchema = z.object({
  total: z.number(),
  page: z.number(),
  totalPages: z.number(),
});

export type TransactionMetadata = z.infer<typeof TransactionMetadataSchema>;
export type TransactionItem = z.infer<typeof TransactionItemSchema>;
export type TransactionData = z.infer<typeof TransactionDataSchema>;
export type TransactionBatchRequest = z.infer<
  typeof TransactionBatchRequestSchema
>;
export type TransactionBatchResponse = z.infer<
  typeof TransactionBatchResponseSchema
>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const ScheduleInputSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly"]),
  time: z.string(),
  timezone: z.string(),
  dayOfWeek: z.string().optional(),
  dayOfMonth: z.string().optional(),
});

export const TokenAmountInputSchema = z.object({
  amount: z
    .string()
    .regex(/^\d+$/, "Amount must be a whole number in smallest unit")
    .describe(
      'Raw token amount in smallest unit (bones). e.g. for a mint with 8 decimals, 1 full token = "100000000"',
    ),
  mint: PublicKeySchema.describe("Mint address of the token"),
});

export const TokenAmountOutputSchema = z.object({
  amount: z
    .string()
    .describe(
      'Raw token amount in smallest unit (bones). e.g. for a mint with 8 decimals, 1 full token = "100000000"',
    ),
  decimals: z.number().describe("Number of decimals for the mint"),
  uiAmount: z
    .number()
    .nullable()
    .describe("Numeric amount if <= Number.MAX_SAFE_INTEGER, otherwise null"),
  uiAmountString: z.string().describe("String representation of the uiAmount"),
  mint: PublicKeySchema.describe("Mint address of the token"),
});

export const RewardSplitInputSchema = z.discriminatedUnion("type", [
  z.object({
    address: WalletAddressSchema,
    type: z.literal("percentage"),
    amount: z.number().describe("0-100 (e.g. 50 = 50%)"),
  }),
  z.object({
    address: WalletAddressSchema,
    type: z.literal("fixed"),
    tokenAmount: TokenAmountInputSchema,
  }),
]);

export type TokenAmountInput = z.infer<typeof TokenAmountInputSchema>;
export type TokenAmountOutput = z.infer<typeof TokenAmountOutputSchema>;
export type ScheduleInput = z.infer<typeof ScheduleInputSchema>;
export type RewardSplitInput = z.infer<typeof RewardSplitInputSchema>;

// ---------------------------------------------------------------------------
// Transaction response factories
// ---------------------------------------------------------------------------

export function typedTransactionData<T extends z.ZodTypeAny>(
  metadataSchema: T,
) {
  return z.object({
    transactions: z.array(
      z.object({
        serializedTransaction: z.string(),
        metadata: metadataSchema.optional(),
      }),
    ),
    parallel: z.boolean(),
    tag: z.string().optional(),
  });
}

export function createTransactionResponse() {
  return z.object({
    transactionData: TransactionDataSchema,
    estimatedSolFee: TokenAmountOutputSchema.describe(
      "Estimated total SOL fee including rent, priority fees, and automation costs",
    ),
  });
}

export function createTypedTransactionResponse<T extends z.ZodTypeAny>(
  metadataSchema: T,
) {
  return z.object({
    transactionData: typedTransactionData(metadataSchema),
    estimatedSolFee: TokenAmountOutputSchema.describe(
      "Estimated total SOL fee including rent, priority fees, and automation costs",
    ),
  });
}

export function createPaginatedTransactionResponse() {
  return createTransactionResponse().extend({
    hasMore: z
      .boolean()
      .describe(
        "True if more work remains — call again with the same arguments to continue.",
      ),
  });
}

export function createTypedPaginatedTransactionResponse<T extends z.ZodTypeAny>(
  metadataSchema: T,
) {
  return createTypedTransactionResponse(metadataSchema).extend({
    hasMore: z
      .boolean()
      .describe(
        "True if more work remains — call again with the same arguments to continue.",
      ),
  });
}
