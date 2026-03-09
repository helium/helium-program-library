import { z } from "zod";
import {
  createTransactionResponse,
  TokenAmountInputSchema,
  WalletAddressSchema,
} from "./common"

export const GetBalancesInputSchema = z.object({
  walletAddress: WalletAddressSchema,
});

export const TransferInputSchema = z.object({
  walletAddress: WalletAddressSchema,
  destination: z.string().min(32),
  tokenAmount: TokenAmountInputSchema,
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
export const CreateHntAccountOutputSchema = createTransactionResponse();

export type GetBalancesInput = z.infer<typeof GetBalancesInputSchema>;
export type TransferInput = z.infer<typeof TransferInputSchema>;
export type CreateHntAccountInput = z.infer<typeof CreateHntAccountInputSchema>;
export type TokenAccount = z.infer<typeof TokenAccountSchema>;
export type TokenBalanceData = z.infer<typeof TokenBalanceDataSchema>;
export type TransferOutput = z.infer<typeof TransferOutputSchema>;
export type CreateHntAccountOutput = z.infer<typeof CreateHntAccountOutputSchema>;
