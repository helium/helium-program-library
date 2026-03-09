import { z } from "zod";
import {
  createPaginatedTransactionResponse,
  createTransactionResponse,
  createTypedPaginatedTransactionResponse,
  createTypedTransactionResponse,
  PublicKeySchema,
  TokenAmountInputSchema,
  WalletAddressSchema,
} from "./common";

export const LockupKindSchema = z.enum(["cliff", "constant"]);

export const CreatePositionInputSchema = z.object({
  walletAddress: WalletAddressSchema.describe(
    "Wallet address that will own the position"
  ),
  tokenAmount: TokenAmountInputSchema.describe(
    "Token amount and mint to deposit"
  ),
  lockupKind: LockupKindSchema.describe("Type of lockup: cliff or constant"),
  lockupPeriodsInDays: z
    .number()
    .int()
    .min(1)
    .max(2920)
    .describe("Number of days to lock the position (max ~8 years)"),
  subDaoMint: PublicKeySchema.optional().describe(
    "Sub-DAO mint to delegate to immediately after creation (optional)"
  ),
  automationEnabled: z
    .boolean()
    .optional()
    .describe("Enable delegation claim bot automation (optional)"),
});

export const ClosePositionInputSchema = z.object({
  walletAddress: WalletAddressSchema.describe(
    "Wallet address that owns the position"
  ),
  positionMint: PublicKeySchema.describe("Mint address of the position NFT"),
});

export const ExtendPositionInputSchema = z.object({
  walletAddress: WalletAddressSchema.describe(
    "Wallet address that owns the position"
  ),
  positionMint: PublicKeySchema.describe("Mint address of the position NFT"),
  lockupPeriodsInDays: z
    .number()
    .int()
    .min(1)
    .describe("New lockup period in days"),
});

export const FlipLockupKindInputSchema = z.object({
  walletAddress: WalletAddressSchema.describe(
    "Wallet address that owns the position"
  ),
  positionMint: PublicKeySchema.describe("Mint address of the position NFT"),
});

export const ResetLockupInputSchema = z.object({
  walletAddress: WalletAddressSchema.describe(
    "Wallet address that owns the position"
  ),
  positionMint: PublicKeySchema.describe("Mint address of the position NFT"),
  lockupKind: LockupKindSchema.describe("New lockup type: cliff or constant"),
  lockupPeriodsInDays: z
    .number()
    .int()
    .min(1)
    .max(1460)
    .describe("New lockup period in days (max 4 years)"),
});

export const SplitPositionInputSchema = z.object({
  walletAddress: WalletAddressSchema.describe(
    "Wallet address that owns the position"
  ),
  positionMint: PublicKeySchema.describe(
    "Mint address of the source position NFT"
  ),
  amount: z
    .string()
    .regex(/^\d+$/, "Amount must be a whole number in smallest unit (bones)")
    .describe(
      "Raw token amount to transfer to new position (in smallest unit)"
    ),
  lockupKind: LockupKindSchema.describe("Lockup type for new position"),
  lockupPeriodsInDays: z
    .number()
    .int()
    .min(1)
    .describe("Lockup period for new position in days"),
});

export const TransferPositionInputSchema = z.object({
  walletAddress: WalletAddressSchema.describe(
    "Wallet address that owns both positions"
  ),
  positionMint: PublicKeySchema.describe(
    "Mint address of the source position NFT"
  ),
  targetPositionMint: PublicKeySchema.describe(
    "Mint address of the target position NFT"
  ),
  amount: z
    .string()
    .regex(/^\d+$/, "Amount must be a whole number in smallest unit (bones)")
    .describe("Raw token amount to transfer (in smallest unit)"),
});

export const DelegatePositionInputSchema = z.object({
  walletAddress: WalletAddressSchema.describe(
    "Wallet address that owns the positions"
  ),
  positionMints: z
    .array(PublicKeySchema)
    .min(1)
    .describe("Array of position NFT mint addresses to delegate"),
  subDaoMint: PublicKeySchema.describe("Sub-DAO mint address to delegate to"),
  automationEnabled: z
    .boolean()
    .optional()
    .describe("Enable delegation claim bot automation"),
});

export const ExtendDelegationInputSchema = z.object({
  walletAddress: WalletAddressSchema.describe(
    "Wallet address that owns the position"
  ),
  positionMint: PublicKeySchema.describe("Mint address of the position NFT"),
});

export const UndelegateInputSchema = z.object({
  walletAddress: WalletAddressSchema.describe(
    "Wallet address that owns the position"
  ),
  positionMint: PublicKeySchema.describe("Mint address of the position NFT"),
});

export const ClaimDelegationRewardsInputSchema = z.object({
  walletAddress: WalletAddressSchema.describe(
    "Wallet address that owns the positions"
  ),
  positionMints: z
    .array(PublicKeySchema)
    .min(1)
    .describe("Array of position NFT mint addresses to claim rewards for"),
});

export const VoteInputSchema = z.object({
  walletAddress: WalletAddressSchema.describe(
    "Wallet address that owns the positions"
  ),
  proposalKey: PublicKeySchema.describe("Public key of the proposal to vote on"),
  positionMints: z
    .array(PublicKeySchema)
    .min(1)
    .describe("Array of position NFT mint addresses to vote with"),
  choice: z.number().int().min(0).describe("The choice index to vote for"),
});

export const RelinquishVoteInputSchema = z.object({
  walletAddress: WalletAddressSchema.describe(
    "Wallet address that owns the positions"
  ),
  proposalKey: PublicKeySchema.describe(
    "Public key of the proposal to relinquish vote from"
  ),
  positionMints: z
    .array(PublicKeySchema)
    .min(1)
    .describe("Array of position NFT mint addresses to relinquish votes for"),
  choice: z.number().int().min(0).describe("The choice index to relinquish"),
});

export const RelinquishPositionVotesInputSchema = z.object({
  walletAddress: WalletAddressSchema.describe(
    "Wallet address that owns the position"
  ),
  positionMint: PublicKeySchema.describe("Mint address of the position NFT"),
  organization: PublicKeySchema.describe(
    "Public key of the DAO organization to relinquish votes from"
  ),
});

export const AssignProxiesInputSchema = z.object({
  walletAddress: WalletAddressSchema.describe(
    "Wallet address that owns the positions"
  ),
  positionMints: z
    .array(PublicKeySchema)
    .min(1)
    .describe("Array of position NFT mint addresses to assign proxy for"),
  proxyKey: PublicKeySchema.describe(
    "Public key of the proxy recipient who will vote on your behalf"
  ),
  expirationTime: z
    .number()
    .int()
    .describe("Unix timestamp when the proxy assignment expires"),
});

export const UnassignProxiesInputSchema = z.object({
  walletAddress: WalletAddressSchema.describe(
    "Wallet address that owns the positions"
  ),
  proxyKey: PublicKeySchema.describe("Public key of the proxy to unassign"),
  positionMints: z
    .array(PublicKeySchema)
    .min(1)
    .describe("Array of position NFT mint addresses to unassign proxy for"),
});

// ---------------------------------------------------------------------------
// Typed metadata schemas for endpoints with extra fields
// ---------------------------------------------------------------------------

const CreatePositionMetadataSchema = z.object({
  type: z.string(),
  description: z.string(),
  positionMint: z.string().optional(),
});

const SplitPositionMetadataSchema = z.object({
  type: z.string(),
  description: z.string(),
  newPositionMint: z.string().optional(),
});

const RelinquishAllVotesMetadataSchema = z.object({
  type: z.string(),
  description: z.string(),
  votesRelinquished: z.number().optional(),
});

// ---------------------------------------------------------------------------
// Per-endpoint response schemas — simple (no hasMore)
// ---------------------------------------------------------------------------

export const CreatePositionResponseSchema = createTypedTransactionResponse(
  CreatePositionMetadataSchema,
);
export const ClosePositionResponseSchema = createTransactionResponse();
export const ExtendPositionResponseSchema = createTransactionResponse();
export const FlipLockupKindResponseSchema = createTransactionResponse();
export const ResetLockupResponseSchema = createTransactionResponse();
export const SplitPositionResponseSchema = createTypedTransactionResponse(
  SplitPositionMetadataSchema,
);
export const TransferPositionResponseSchema = createTransactionResponse();
export const ExtendDelegationResponseSchema = createTransactionResponse();

// ---------------------------------------------------------------------------
// Per-endpoint response schemas — paginated (hasMore required)
// ---------------------------------------------------------------------------

export const DelegatePositionsResponseSchema =
  createPaginatedTransactionResponse();
export const ClaimDelegationRewardsResponseSchema =
  createPaginatedTransactionResponse();
export const UndelegatePositionResponseSchema =
  createPaginatedTransactionResponse();
export const VoteResponseSchema = createPaginatedTransactionResponse();
export const RelinquishVoteResponseSchema =
  createPaginatedTransactionResponse();
export const RelinquishPositionVotesResponseSchema =
  createTypedPaginatedTransactionResponse(RelinquishAllVotesMetadataSchema);
export const AssignProxiesResponseSchema =
  createPaginatedTransactionResponse();
export const UnassignProxiesResponseSchema =
  createPaginatedTransactionResponse();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LockupKind = z.infer<typeof LockupKindSchema>;
export type CreatePositionInput = z.infer<typeof CreatePositionInputSchema>;
export type ClosePositionInput = z.infer<typeof ClosePositionInputSchema>;
export type ExtendPositionInput = z.infer<typeof ExtendPositionInputSchema>;
export type FlipLockupKindInput = z.infer<typeof FlipLockupKindInputSchema>;
export type ResetLockupInput = z.infer<typeof ResetLockupInputSchema>;
export type SplitPositionInput = z.infer<typeof SplitPositionInputSchema>;
export type TransferPositionInput = z.infer<typeof TransferPositionInputSchema>;
export type DelegatePositionInput = z.infer<typeof DelegatePositionInputSchema>;
export type ExtendDelegationInput = z.infer<typeof ExtendDelegationInputSchema>;
export type UndelegateInput = z.infer<typeof UndelegateInputSchema>;
export type ClaimDelegationRewardsInput = z.infer<
  typeof ClaimDelegationRewardsInputSchema
>;
export type VoteInput = z.infer<typeof VoteInputSchema>;
export type RelinquishVoteInput = z.infer<typeof RelinquishVoteInputSchema>;
export type RelinquishPositionVotesInput = z.infer<
  typeof RelinquishPositionVotesInputSchema
>;
export type AssignProxiesInput = z.infer<typeof AssignProxiesInputSchema>;
export type UnassignProxiesInput = z.infer<typeof UnassignProxiesInputSchema>;

export type CreatePositionResponse = z.infer<
  typeof CreatePositionResponseSchema
>;
export type ClosePositionResponse = z.infer<typeof ClosePositionResponseSchema>;
export type ExtendPositionResponse = z.infer<
  typeof ExtendPositionResponseSchema
>;
export type FlipLockupKindResponse = z.infer<
  typeof FlipLockupKindResponseSchema
>;
export type ResetLockupResponse = z.infer<typeof ResetLockupResponseSchema>;
export type SplitPositionResponse = z.infer<typeof SplitPositionResponseSchema>;
export type TransferPositionResponse = z.infer<
  typeof TransferPositionResponseSchema
>;
export type DelegatePositionsResponse = z.infer<
  typeof DelegatePositionsResponseSchema
>;
export type ExtendDelegationResponse = z.infer<
  typeof ExtendDelegationResponseSchema
>;
export type UndelegatePositionResponse = z.infer<
  typeof UndelegatePositionResponseSchema
>;
export type ClaimDelegationRewardsResponse = z.infer<
  typeof ClaimDelegationRewardsResponseSchema
>;
export type VoteResponse = z.infer<typeof VoteResponseSchema>;
export type RelinquishVoteResponse = z.infer<
  typeof RelinquishVoteResponseSchema
>;
export type RelinquishPositionVotesResponse = z.infer<
  typeof RelinquishPositionVotesResponseSchema
>;
export type AssignProxiesResponse = z.infer<typeof AssignProxiesResponseSchema>;
export type UnassignProxiesResponse = z.infer<
  typeof UnassignProxiesResponseSchema
>;
