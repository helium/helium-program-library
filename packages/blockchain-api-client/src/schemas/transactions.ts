import { z } from "zod";
import { TransactionMetadataSchema, TransactionItemSchema, TokenAmountOutputSchema } from "./common";

export const SubmitInputSchema = z.object({
  transactions: z.array(TransactionItemSchema),
  parallel: z.boolean(),
  tag: z.string().optional(),
  actionMetadata: z.record(z.string(), z.unknown()).optional(),
  simulationCommitment: z.enum(["confirmed", "finalized"]).optional().default("confirmed"),
  simulate: z.boolean().optional().default(true),
});

export const GetInputSchema = z.object({
  id: z.string(),
  commitment: z.enum(["confirmed", "finalized"]),
});

export const ResubmitInputSchema = z.object({
  id: z.string(),
});

export const GetByPayerInputSchema = z.object({
  payer: z.string().min(32),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional().default("pending"),
});

export const GetByPayerAndTagInputSchema = z.object({
  payer: z.string().min(32),
  tag: z.string(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional().default("pending"),
});

export const SubmitOutputSchema = z.object({
  batchId: z.string(),
  message: z.string().optional(),
});

const TransactionStateSchema = z.union([
  z.literal("pending"),
  z.literal("confirmed"),
  z.literal("failed"),
  z.literal("expired"),
  z.literal("partial")
]);

export const TransactionStatusSchema = z.object({
  signature: z.string(),
  status: TransactionStateSchema,
  transaction: z.unknown().optional(),
});

export const BatchStatusOutputSchema = z.object({
  batchId: z.string(),
  status: TransactionStateSchema,
  submissionType: z.union([
    z.literal("single"),
    z.literal("parallel"),
    z.literal("sequential"),
    z.literal("jito_bundle"),
  ]),
  parallel: z.boolean(),
  transactions: z.array(TransactionStatusSchema),
  jitoBundleId: z.string().optional().nullable(),
  jitoBundleStatus: z.unknown().optional().nullable(),
});

export const ResubmitOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  error: z.string().optional(),
  newSignatures: z.array(z.string()).optional(),
});

export const PayerBatchSummarySchema = z.object({
  batchId: z.string(),
  tag: z.string().optional(),
  status: z.string(),
  submissionType: z.string(),
  parallel: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  transactions: z.array(
    z.object({
      metadata: TransactionMetadataSchema.optional(),
    })
  ),
});

export const PayerBatchesOutputSchema = z.object({
  payer: z.string(),
  batches: z.array(PayerBatchSummarySchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

export type SubmitInput = z.infer<typeof SubmitInputSchema>;
export type GetInput = z.infer<typeof GetInputSchema>;
export type ResubmitInput = z.infer<typeof ResubmitInputSchema>;
export type GetByPayerInput = z.infer<typeof GetByPayerInputSchema>;
export type GetByPayerAndTagInput = z.infer<typeof GetByPayerAndTagInputSchema>;
export type SubmitOutput = z.infer<typeof SubmitOutputSchema>;
export type BatchStatusOutput = z.infer<typeof BatchStatusOutputSchema>;
export type ResubmitOutput = z.infer<typeof ResubmitOutputSchema>;
export type PayerBatchesOutput = z.infer<typeof PayerBatchesOutputSchema>;
export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;
export type PayerBatchSummary = z.infer<typeof PayerBatchSummarySchema>;

// Estimate endpoint schemas
export const EstimateInputSchema = z.object({
  transactions: z.array(TransactionItemSchema),
  parallel: z.boolean(),
  tag: z.string().optional(),
  simulationCommitment: z.enum(["confirmed", "finalized"]).optional().default("confirmed"),
});

const CostBreakdownSchema = z.object({
  transactionFees: TokenAmountOutputSchema,
  rent: TokenAmountOutputSchema,
  tokenTransfers: z.array(TokenAmountOutputSchema),
});

const TransactionEstimateSchema = z.object({
  index: z.number(),
  computeUnits: z.number(),
  success: z.boolean(),
  error: z.string().optional(),
  logs: z.array(z.string()).optional(),
  costs: CostBreakdownSchema,
});

export const EstimateOutputSchema = z.object({
  totalSol: TokenAmountOutputSchema,
  breakdown: CostBreakdownSchema,
  transactions: z.array(TransactionEstimateSchema),
});

export type EstimateInput = z.infer<typeof EstimateInputSchema>;
export type EstimateOutput = z.infer<typeof EstimateOutputSchema>;

// History endpoint schemas

export const GetHistoryInputSchema = z.object({
  payer: z.string().min(32),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  actionType: z.string().optional(),
});

export const HistoryTransactionSchema = z.object({
  signature: z.string(),
  status: z.string(),
  type: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const HistoryActionSchema = z.object({
  id: z.string(),
  source: z.enum(["blockchain_api", "on_chain"]),
  actionType: z.string(),
  actionMetadata: z.record(z.string(), z.unknown()).nullable(),
  status: z.string(),
  transactions: z.array(HistoryTransactionSchema),
  timestamp: z.string(),
});

export const HistoryOutputSchema = z.object({
  payer: z.string(),
  actions: z.array(HistoryActionSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

export type GetHistoryInput = z.infer<typeof GetHistoryInputSchema>;
export type HistoryTransaction = z.infer<typeof HistoryTransactionSchema>;
export type HistoryAction = z.infer<typeof HistoryActionSchema>;
export type HistoryOutput = z.infer<typeof HistoryOutputSchema>;
