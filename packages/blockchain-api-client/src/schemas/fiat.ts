import { z } from "zod";
import { createTransactionResponse } from "./common";
import { QuoteResponseSchema } from "./swap";

export const InitKycInputSchema = z.object({
  type: z.enum(["individual", "business"]).optional(),
});

export const CreateBankAccountInputSchema = z.object({
  currency: z.string(),
  account_type: z.string(),
  bank_name: z.string(),
  account_name: z.string(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  account_owner_name: z.string().optional(),
  business_name: z.string().optional(),
  account: z.object({
    account_number: z.string(),
    routing_number: z.string(),
    checking_or_savings: z.string(),
  }),
  address: z.object({
    street_line_1: z.string(),
    line2: z.string().optional(),
    city: z.string(),
    state: z.string(),
    postal_code: z.string(),
    country: z.string(),
  }),
});

export const GetBankAccountInputSchema = z.object({
  id: z.string(),
});

export const DeleteBankAccountInputSchema = z.object({
  id: z.number(),
});

export const GetSendQuoteInputSchema = z.object({
  id: z.string(),
  usdAmount: z.string(),
});

export const SendFundsInputSchema = z.object({
  id: z.string(),
  userAddress: z.string(),
  quoteResponse: QuoteResponseSchema,
});

export const GetTransferInputSchema = z.object({
  id: z.string(),
});

export const UpdateTransferInputSchema = z.object({
  id: z.string(),
  solanaSignature: z.string(),
});

export const KycStatusOutputSchema = z.object({
  kycStatus: z.string(),
  tosStatus: z.string(),
  tosLink: z.string().nullable(),
  kycLink: z.string().nullable(),
  kycLinkId: z.string().nullable(),
  accountType: z.string().optional(),
  rejectionReasons: z.array(z.string()).optional(),
});

export const FeesOutputSchema = z.object({
  developer_fee: z.string(),
  developer_fee_percent: z.number(),
});

export const BankAccountSchema = z
  .object({
    id: z.number().optional(),
    bridgeUserId: z.number().optional(),
    bridgeExternalAccountId: z.string().optional(),
    accountName: z.string().optional(),
    bankName: z.string().optional(),
    lastFourDigits: z.string().optional(),
    routingNumber: z.string().optional(),
    accountType: z.string().optional(),
    createdAt: z.union([z.string(), z.date()]).optional(),
    updatedAt: z.union([z.string(), z.date()]).optional(),
  })
  .passthrough();

export const BankAccountListOutputSchema = z.array(BankAccountSchema);

export const DeleteBankAccountOutputSchema = z.object({
  success: z.boolean(),
});

export const BridgeTransferSchema = z
  .object({
    id: z.string(),
    state: z.string(),
    source_deposit_instructions: z.object({
      to_address: z.string(),
    }),
  })
  .passthrough();

export const SendFundsOutputSchema = createTransactionResponse().extend({
  bridgeTransfer: BridgeTransferSchema,
});

export const UpdateTransferOutputSchema = z.object({
  success: z.boolean(),
});

export const QuoteOutputSchema = QuoteResponseSchema;

export type InitKycInput = z.infer<typeof InitKycInputSchema>;
export type CreateBankAccountInput = z.infer<typeof CreateBankAccountInputSchema>;
export type GetBankAccountInput = z.infer<typeof GetBankAccountInputSchema>;
export type DeleteBankAccountInput = z.infer<typeof DeleteBankAccountInputSchema>;
export type GetSendQuoteInput = z.infer<typeof GetSendQuoteInputSchema>;
export type SendFundsInput = z.infer<typeof SendFundsInputSchema>;
export type GetTransferInput = z.infer<typeof GetTransferInputSchema>;
export type UpdateTransferInput = z.infer<typeof UpdateTransferInputSchema>;
export type KycStatusOutput = z.infer<typeof KycStatusOutputSchema>;
export type FeesOutput = z.infer<typeof FeesOutputSchema>;
export type BankAccount = z.infer<typeof BankAccountSchema>;
export type BankAccountListOutput = z.infer<typeof BankAccountListOutputSchema>;
export type DeleteBankAccountOutput = z.infer<typeof DeleteBankAccountOutputSchema>;
export type BridgeTransfer = z.infer<typeof BridgeTransferSchema>;
export type SendFundsOutput = z.infer<typeof SendFundsOutputSchema>;
export type UpdateTransferOutput = z.infer<typeof UpdateTransferOutputSchema>;
