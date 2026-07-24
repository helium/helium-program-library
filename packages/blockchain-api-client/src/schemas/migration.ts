import { z } from "zod";
import {
  TransactionDataSchema,
  TokenAmountInputSchema,
  TokenAmountOutputSchema,
  HeliumPublicKeySchema,
  WalletAddressSchema,
  TransactionMetadataSchema,
} from "./common";
import { HotspotSchema } from "./hotspots";

export const MigrateInputSchema = z.object({
  sourceWallet: WalletAddressSchema,
  destinationWallet: WalletAddressSchema,
  // Hotspots are Helium entity keys (ECC-compact base58, can exceed 44 chars),
  // not Solana pubkeys — the handler resolves them via getAssetIdFromPubkey.
  hotspots: z.array(HeliumPublicKeySchema).default([]),
  // Malformed mints/amounts must fail validation as BAD_REQUEST — the handler
  // feeds them straight into new PublicKey()/BigInt(), which would 500.
  tokens: z.array(TokenAmountInputSchema).default([]),
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
      "True if more work remains — submit these transactions, then call again with nextParams."
    ),
  nextParams: MigrateInputSchema.optional().describe(
    "Input for the next call. Present when hasMore is true — submit this batch and wait for confirmation first, then pass directly to the next migrate call (positions are re-enumerated on-chain, so calling early re-issues transfers for in-flight positions)."
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
export type MigratableHotspotsInput = z.infer<
  typeof MigratableHotspotsInputSchema
>;
export type MigratableHotspotsOutput = z.infer<
  typeof MigratableHotspotsOutputSchema
>;
