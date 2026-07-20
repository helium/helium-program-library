import { z } from "zod";
import {
  createTransactionResponse,
  PublicKeySchema,
  squadsProposeFields,
  TokenAmountInputSchema,
  WalletAddressSchema,
} from "./common";

export const GetBalancesInputSchema = z.object({
  walletAddress: WalletAddressSchema,
});

export const TransferInputSchema = z.object({
  walletAddress: WalletAddressSchema,
  destination: z.string().min(32),
  tokenAmount: TokenAmountInputSchema,
  ...squadsProposeFields,
});

export const MultiTransferRecipientSchema = z.object({
  destination: WalletAddressSchema,
  amount: z
    .string()
    .regex(/^\d+$/, "Amount must be a whole number in smallest unit")
    .describe(
      'Raw token amount in smallest unit (bones). e.g. for a mint with 8 decimals, 1 full token = "100000000"'
    ),
});

export const MultiTransferInputSchema = z.object({
  walletAddress: WalletAddressSchema,
  mint: PublicKeySchema.describe(
    "Mint address of the token to transfer to all recipients"
  ),
  recipients: z
    .array(MultiTransferRecipientSchema)
    .min(1)
    .describe(
      "Recipients receiving the same mint, packed into as few txs as possible"
    ),
});

export const BurnInputSchema = z.object({
  walletAddress: WalletAddressSchema,
  tokenAmount: TokenAmountInputSchema,
  ...squadsProposeFields,
});

export const MemoInputSchema = z.object({
  walletAddress: WalletAddressSchema,
  memo: z.string().min(1).max(500).describe("UTF-8 memo text"),
});

export const CreateHntAccountInputSchema = z.object({
  walletAddress: WalletAddressSchema,
});

export const TokenAccountSchema = z.object({
  mint: z.string(),
  address: z.string(),
  balance: z.string(),
  decimals: z.number(),
  uiAmount: z.number(),
  symbol: z.string().optional(),
  name: z.string().optional(),
  logoURI: z.string().optional(),
  priceUsd: z.number().optional(),
  balanceUsd: z.number().optional(),
});

export const TokenBalanceDataSchema = z.object({
  totalBalanceUsd: z.number(),
  solBalance: z.number(),
  solBalanceUsd: z.number(),
  tokens: z.array(TokenAccountSchema),
});

export const TransferOutputSchema = createTransactionResponse();
export const MultiTransferOutputSchema = createTransactionResponse();
export const BurnOutputSchema = createTransactionResponse();
export const MemoOutputSchema = createTransactionResponse();
export const CreateHntAccountOutputSchema = createTransactionResponse();

export type GetBalancesInput = z.infer<typeof GetBalancesInputSchema>;
export type TransferInput = z.infer<typeof TransferInputSchema>;
export type MultiTransferRecipient = z.infer<
  typeof MultiTransferRecipientSchema
>;
export type MultiTransferInput = z.infer<typeof MultiTransferInputSchema>;
export type CreateHntAccountInput = z.infer<typeof CreateHntAccountInputSchema>;
export type TokenAccount = z.infer<typeof TokenAccountSchema>;
export type TokenBalanceData = z.infer<typeof TokenBalanceDataSchema>;
export type TransferOutput = z.infer<typeof TransferOutputSchema>;
export type MultiTransferOutput = z.infer<typeof MultiTransferOutputSchema>;
export type BurnInput = z.infer<typeof BurnInputSchema>;
export type MemoInput = z.infer<typeof MemoInputSchema>;
export type CreateHntAccountOutput = z.infer<
  typeof CreateHntAccountOutputSchema
>;
