import { z } from "zod";
import {
  TransactionDataSchema,
  TokenAmountOutputSchema,
  WalletAddressSchema,
  TransactionMetadataSchema,
} from "./common";
import { HotspotSchema } from "./hotspots";

export const MigrateInputSchema = z.object({
  sourceWallet: WalletAddressSchema,
  destinationWallet: WalletAddressSchema,
  hotspots: z.array(z.string()).default([]),
  tokens: z
    .array(
      z.object({
        mint: z.string(),
        amount: z.string(),
      }),
    )
    .default([]),
  password: z.string().optional(),
});

export const MigrateTransactionItemSchema = z.object({
  serializedTransaction: z.string(),
  metadata: TransactionMetadataSchema.extend({
    signers: z.array(z.enum(["source", "destination"])),
  }).optional(),
});

export const MigrateTransactionDataSchema = z.object({
  transactions: z.array(MigrateTransactionItemSchema),
  parallel: z.boolean(),
  tag: z.string().optional(),
});

export const MigrateOutputSchema = z.object({
  transactionData: MigrateTransactionDataSchema,
  estimatedSolFee: TokenAmountOutputSchema,
  warnings: z.array(z.string()).optional(),
  hasMore: z
    .boolean()
    .optional()
    .describe(
      "True if more work remains — submit these transactions, then call again with nextParams.",
    ),
  nextParams: MigrateInputSchema.optional().describe(
    "Input for the next call. Present when hasMore is true — pass directly to the next migrate call.",
  ),
});

export const MigratableHotspotSchema = HotspotSchema.extend({
  inWelcomePack: z.boolean(),
  splitWallets: z.array(z.string()).optional(),
});

export const MigratableHotspotsInputSchema = z.object({
  walletAddress: WalletAddressSchema,
});

export const MigratableHotspotsOutputSchema = z.object({
  hotspots: z.array(MigratableHotspotSchema),
});

export type MigrateInput = z.infer<typeof MigrateInputSchema>;
export type MigrateOutput = z.infer<typeof MigrateOutputSchema>;
export type MigratableHotspotsInput = z.infer<typeof MigratableHotspotsInputSchema>;
export type MigratableHotspotsOutput = z.infer<typeof MigratableHotspotsOutputSchema>;
