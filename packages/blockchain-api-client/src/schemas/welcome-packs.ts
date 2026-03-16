import { z } from "zod"
import { createTransactionResponse, RewardSplitInputSchema, ScheduleInputSchema, TokenAmountInputSchema, WalletAddressSchema } from "./common"
import { HotspotSchema } from "./hotspots"

export const WelcomePackListInputSchema = z.object({
  walletAddress: WalletAddressSchema,
});

export const WelcomePackCreateInputSchema = z.object({
  walletAddress: WalletAddressSchema,
  assetId: z.string(),
  solAmount: TokenAmountInputSchema,
  rentRefund: z.string(),
  assetReturnAddress: z.string(),
  rewardsSplit: z.array(RewardSplitInputSchema),
  schedule: ScheduleInputSchema,
  lazyDistributor: z.string(),
});

export const WelcomePackGetInputSchema = z.object({
  walletAddress: WalletAddressSchema,
  packId: z.number(),
});

export const WelcomePackDeleteInputSchema = z.object({
  walletAddress: WalletAddressSchema,
  packId: z.number(),
});

export const WelcomePackGetByAddressInputSchema = z.object({
  packAddress: z.string().min(32),
});

export const WelcomePackClaimInputSchema = z.object({
  packAddress: z.string().min(32),
  walletAddress: WalletAddressSchema,
  signature: z.string(),
  expirationTs: z.string(),
});

export const WelcomePackInviteInputSchema = z.object({
  packAddress: z.string().min(32),
  walletAddress: WalletAddressSchema,
  expirationDays: z.number().int().positive().max(365).default(7),
});

export const WelcomePackSchema = z.object({
  address: z.string(),
  id: z.number(),
  owner: z.string(),
  asset: z.string(),
  lazyDistributor: z.string(),
  rewardsMint: z.string(),
  rentRefund: z.string(),
  solAmount: z.string(),
  rewardsSplit: z.array(RewardSplitInputSchema),
  rewardsSchedule: z.string(),
  assetReturnAddress: z.string(),
  bumpSeed: z.number(),
  uniqueId: z.string(),
  loading: z.boolean().optional(),
  hotspot: HotspotSchema.nullable(),
});

export const WelcomePackListOutputSchema = z.array(WelcomePackSchema);

export const WelcomePackCreateOutputSchema = createTransactionResponse().extend({
  welcomePack: WelcomePackSchema,
});

export const WelcomePackDeleteOutputSchema = createTransactionResponse();
export const WelcomePackClaimOutputSchema = createTransactionResponse();

export const WelcomePackInviteOutputSchema = z.object({
  message: z.string(),
  expirationTs: z.number(),
});

export type WelcomePackListInput = z.infer<typeof WelcomePackListInputSchema>;
export type WelcomePackCreateInput = z.infer<typeof WelcomePackCreateInputSchema>;
export type WelcomePackGetInput = z.infer<typeof WelcomePackGetInputSchema>;
export type WelcomePackDeleteInput = z.infer<typeof WelcomePackDeleteInputSchema>;
export type WelcomePackGetByAddressInput = z.infer<typeof WelcomePackGetByAddressInputSchema>;
export type WelcomePackClaimInput = z.infer<typeof WelcomePackClaimInputSchema>;
export type WelcomePackInviteInput = z.infer<typeof WelcomePackInviteInputSchema>;
export type WelcomePack = z.infer<typeof WelcomePackSchema>;
export type WelcomePackListOutput = z.infer<typeof WelcomePackListOutputSchema>;
export type WelcomePackCreateOutput = z.infer<typeof WelcomePackCreateOutputSchema>;
export type WelcomePackDeleteOutput = z.infer<typeof WelcomePackDeleteOutputSchema>;
export type WelcomePackClaimOutput = z.infer<typeof WelcomePackClaimOutputSchema>;
export type WelcomePackInviteOutput = z.infer<typeof WelcomePackInviteOutputSchema>;
