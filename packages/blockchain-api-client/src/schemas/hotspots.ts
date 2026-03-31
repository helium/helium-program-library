import { z } from "zod";
import {
  createPaginatedTransactionResponse,
  createTransactionResponse,
  HeliumPublicKeySchema,
  RewardSplitInputSchema,
  ScheduleInputSchema,
  TokenAmountOutputSchema,
  WalletAddressSchema,
} from "./common";

export const RewardNetworkSchema = z.enum(["hnt", "iot", "mobile"]).default("hnt");

export const HotspotTypeSchema = z.enum(["iot", "mobile", "all"]);

export const GetHotspotsInputSchema = z.object({
  walletAddress: WalletAddressSchema,
  type: HotspotTypeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const ClaimRewardsInputSchema = z.object({
  walletAddress: WalletAddressSchema,
  network: RewardNetworkSchema,
  tuktuk: z.boolean().optional(),
});

export const GetPendingRewardsInputSchema = z.object({
  walletAddress: WalletAddressSchema,
  network: RewardNetworkSchema,
});

const PendingRewards = z.object({
  total: TokenAmountOutputSchema.describe("Total rewards pending for the requested wallet, including rewards which may be directly claimable or paid indirectly through automation to this wallet."),
  claimable: TokenAmountOutputSchema.describe("Total rewards that can be manually claimed now. Should be a subset of total."),
  automated: TokenAmountOutputSchema.describe("Total rewards that are pending but will be automatically claimed in the future based on existing automation setups. Should be a subset of total."),
})
export const GetPendingRewardsOutputSchema = z.object({
  pending: PendingRewards.describe("Total rewards pending for the requested wallet - across all relevant hotspots."),
  byHotspot: z.array(z.object({
    hotspotPubKey: HeliumPublicKeySchema,
    pending: PendingRewards,
  }))
})

export const TransferHotspotInputSchema = z.object({
  walletAddress: WalletAddressSchema,
  hotspotPubkey: HeliumPublicKeySchema,
  recipient: WalletAddressSchema,
});

export const UpdateRewardsDestinationInputSchema = z.object({
  walletAddress: WalletAddressSchema,
  hotspotPubkey: HeliumPublicKeySchema,
  destination: WalletAddressSchema,
  lazyDistributors: z.array(z.string().min(32)).min(1),
});

export const GetSplitInputSchema = z.object({
  walletAddress: WalletAddressSchema,
  hotspotPubkey: HeliumPublicKeySchema,
});

export const CreateSplitInputSchema = z.object({
  walletAddress: WalletAddressSchema,
  hotspotPubkey: HeliumPublicKeySchema,
  rewardsSplit: z.array(RewardSplitInputSchema),
  schedule: ScheduleInputSchema,
  lazyDistributor: z.string().min(32),
});

export const DeleteSplitInputSchema = z.object({
  walletAddress: WalletAddressSchema,
  hotspotPubkey: HeliumPublicKeySchema,
});

export const GetAutomationStatusInputSchema = z.object({
  walletAddress: WalletAddressSchema,
});

export const AutomationScheduleSchema = z.enum(["daily", "weekly", "monthly"]);

export const SetupAutomationInputSchema = z.object({
  walletAddress: WalletAddressSchema,
  schedule: AutomationScheduleSchema,
  duration: z.number().int().min(1), // Number of claims
  totalHotspots: z.number().int().min(1),
});

export const FundAutomationInputSchema = z.object({
  walletAddress: WalletAddressSchema,
  additionalDuration: z.number().int().min(1), // Additional number of claims
});

export const GetFundingEstimateInputSchema = z.object({
  walletAddress: WalletAddressSchema,
  duration: z.coerce.number().int().min(1), // Number of claims to estimate funding for
});

export const CloseAutomationInputSchema = z.object({
  walletAddress: WalletAddressSchema,
});

// ============================================================================
// Output Schemas
// ============================================================================

export const DeviceTypeSchema = z.enum([
  "iot-gateway",
  "wifiIndoor",
  "wifiOutdoor",
  "wifiDataOnly",
  "cbrs",
]);

export const OwnershipTypeSchema = z.enum(["owner", "direct", "fanout", "all"]);

export const HotspotSharesSchema = z.object({
  fixed: z.string().optional(),
  percentage: z.number().optional(),
});

export const HotspotSchema = z.object({
  address: z.string(),
  entityKey: z.string(),
  name: z.string(),
  type: HotspotTypeSchema,
  deviceType: DeviceTypeSchema,
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  asset: z.string(),
  isOnline: z.boolean().optional(),
  owner: z.string().optional(),
  shares: HotspotSharesSchema.optional(),
  ownershipType: z.string(),
});

export const HotspotsDataSchema = z.object({
  hotspots: z.array(HotspotSchema),
  total: z.number(),
  page: z.number(),
  totalPages: z.number(),
});

export const ClaimRewardsOutputSchema = createPaginatedTransactionResponse();
export const TransferHotspotOutputSchema = createTransactionResponse();
export const UpdateRewardsDestinationOutputSchema = createTransactionResponse();
export const CreateSplitOutputSchema = createTransactionResponse();
export const DeleteSplitOutputSchema = createTransactionResponse();
export const SetupAutomationOutputSchema = createTransactionResponse();
export const FundAutomationOutputSchema = createTransactionResponse();
export const CloseAutomationOutputSchema = createTransactionResponse();

export const SplitShareSchema = z.object({
  wallet: z.string(),
  delegate: z.string(),
  fixed: TokenAmountOutputSchema,
  shares: z.number(),
});

export const SplitResponseSchema = z.object({
  walletAddress: z.string(),
  hotspotPubkey: z.string(),
  splitAddress: z.string(),
  shares: z.array(SplitShareSchema),
});

export const AutomationStatusOutputSchema = z.object({
  hasExistingAutomation: z.boolean(),
  isOutOfSol: z.boolean(),
  currentSchedule: z
    .object({
      schedule: AutomationScheduleSchema,
      time: z.string(),
      nextRun: z.string(), // ISO date string
    })
    .optional(),
  rentFee: z.number(), // Initial setup rent (BASE_AUTOMATION_RENT + TASK_RETURN_ACCOUNT_SIZE) if automation doesn't exist, 0 otherwise
  recipientFee: z.number(), // SOL needed for recipient accounts (if any)
  operationalSol: z.number(), // Total operational SOL needed for automation claims (cronJobFunding + pdaWalletFunding)
  remainingClaims: z.number().optional(),
  fundingPeriodInfo: z
    .object({
      periodLength: AutomationScheduleSchema,
      periodsRemaining: z.number(), // Minimum of both pools
      cronJobPeriodsRemaining: z.number(),
      pdaWalletPeriodsRemaining: z.number(),
    })
    .optional(),
  cronJobBalance: z.string(), // lamports as string
  pdaWalletBalance: z.string(), // lamports as string
});

export const FundingEstimateOutputSchema = z.object({
  rentFee: z.number(), // Initial setup rent (BASE_AUTOMATION_RENT + TASK_RETURN_ACCOUNT_SIZE) if automation doesn't exist, 0 otherwise
  cronJobFunding: z.number(), // SOL needed for cron job account operations
  pdaWalletFunding: z.number(), // SOL needed for PDA wallet operations
  recipientFee: z.number(), // SOL needed for recipient accounts (if any)
  operationalSol: z.number(), // Total operational SOL needed for automation claims (cronJobFunding + pdaWalletFunding)
  totalSolNeeded: z.number(), // Total SOL needed including all fees (rentFee + operationalSol + recipientFee)
  currentCronJobBalance: z.string(), // Current balance in cronJob (lamports as string)
  currentPdaWalletBalance: z.string(), // Current balance in pdaWallet (lamports as string)
});

// ============================================================================
// Type Exports
// ============================================================================
const WifiDeploymentInfoSchema = z.object({
  type: z.literal("WIFI"),
  antenna: z.number().int().optional(),
  elevation: z.number().optional(),
  azimuth: z.number().min(0).max(360).optional(),
  mechanicalDownTilt: z.number().optional(),
  electricalDownTilt: z.number().optional(),
  serial: z.string().optional().nullable(),
});

const CbrsRadioInfoSchema = z.object({
  radioId: z.string(),
  elevation: z.number(),
});

const CbrsDeploymentInfoSchema = z.object({
  type: z.literal("CBRS"),
  radioInfos: z.array(CbrsRadioInfoSchema).min(1),
});

const DeploymentInfoSchema = z.discriminatedUnion("type", [
  WifiDeploymentInfoSchema,
  CbrsDeploymentInfoSchema,
]);

const LocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const IotUpdateSchema = z.object({
  deviceType: z.literal("iot"),
  entityPubKey: HeliumPublicKeySchema,
  walletAddress: WalletAddressSchema,
  location: LocationSchema.optional(),
  gain: z.number().optional(),
  elevation: z.number().optional(),
  azimuth: z.number().min(0).max(360).optional(),
});

const MobileUpdateSchema = z.object({
  deviceType: z.literal("mobile"),
  entityPubKey: HeliumPublicKeySchema,
  walletAddress: WalletAddressSchema,
  location: LocationSchema.optional(),
  deploymentInfo: DeploymentInfoSchema.optional(),
});

export const UpdateHotspotInfoInputSchema = z.discriminatedUnion("deviceType", [
  IotUpdateSchema,
  MobileUpdateSchema,
]);

export const UpdateHotspotInfoOutputSchema = createTransactionResponse().extend({
  appliedTo: z.object({
    iot: z.boolean(),
    mobile: z.boolean(),
  }),
});

export type HotspotType = z.infer<typeof HotspotTypeSchema>;
export type DeviceType = z.infer<typeof DeviceTypeSchema>;
export type OwnershipType = z.infer<typeof OwnershipTypeSchema>;
export type Hotspot = z.infer<typeof HotspotSchema>;
export type HotspotsData = z.infer<typeof HotspotsDataSchema>;
export type GetHotspotsInput = z.infer<typeof GetHotspotsInputSchema>;
export type ClaimRewardsInput = z.infer<typeof ClaimRewardsInputSchema>;
export type GetPendingRewardsInput = z.infer<typeof GetPendingRewardsInputSchema>;
export type TransferHotspotInput = z.infer<typeof TransferHotspotInputSchema>;
export type GetPendingRewardsOutput = z.infer<typeof GetPendingRewardsOutputSchema>;
export type UpdateRewardsDestinationInput = z.infer<typeof UpdateRewardsDestinationInputSchema>;
export type GetSplitInput = z.infer<typeof GetSplitInputSchema>;
export type CreateSplitInput = z.infer<typeof CreateSplitInputSchema>;
export type DeleteSplitInput = z.infer<typeof DeleteSplitInputSchema>;
export type SplitShare = z.infer<typeof SplitShareSchema>;
export type SplitResponse = z.infer<typeof SplitResponseSchema>;
export type GetAutomationStatusInput = z.infer<
  typeof GetAutomationStatusInputSchema
>;
export type AutomationStatus = z.infer<typeof AutomationStatusOutputSchema>;
export type SetupAutomationInput = z.infer<typeof SetupAutomationInputSchema>;
export type FundAutomationInput = z.infer<typeof FundAutomationInputSchema>;
export type CloseAutomationInput = z.infer<typeof CloseAutomationInputSchema>;
export type GetFundingEstimateInput = z.infer<
  typeof GetFundingEstimateInputSchema
>;
export type FundingEstimate = z.infer<typeof FundingEstimateOutputSchema>;
