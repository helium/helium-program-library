import { z } from "zod";
import {
  TokenAmountInputSchema,
  TokenAmountOutputSchema,
  TransactionDataSchema,
  WalletAddressSchema,
} from "./common";

const CRON_REGEX =
  /^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/;

const RewardSchedule = z
  .string()
  .regex(
    CRON_REGEX,
    "Invalid cron format. Expected 5 fields: minute hour day month weekday",
  )
  .describe(
    `UTC cron expression with 5 fields (e.g. '30 9 * * *' or '0 0 1,15 * *')`,
  );

const RecipientShareInput = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("FIXED"),
    tokenAmount: TokenAmountInputSchema,
  }),
  z.object({
    type: z.literal("SHARES"),
    shares: z
      .number()
      .int()
      .min(1)
      .max(100)
      .describe("Percentage share of rewards"),
  }),
]);

const RecipientShareOutput = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("FIXED"),
    tokenAmount: TokenAmountOutputSchema,
  }),
  z.object({
    type: z.literal("SHARES"),
    shares: z
      .number()
      .int()
      .min(1)
      .max(100)
      .describe("Percentage share of rewards"),
  }),
]);

const RecipientConfigInput = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("PRESET"),
      walletAddress: WalletAddressSchema.describe(
        "The wallet address of a preconfigured recipient",
      ),
      receives: RecipientShareInput,
    })
    .describe("A recipient that uses a preset configuration"),
  z
    .object({
      type: z.literal("CLAIMABLE"),
      giftedCurrency: TokenAmountInputSchema.describe(
        "The amount of currency bundled in the contract, and gifted to the claimer upon creation",
      ),
      receives: RecipientShareInput,
    })
    .describe(
      "A recipient that in yet unknown, but will claim the pending contract",
    ),
]);

const RecipientConfigOutput = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("PRESET"),
      walletAddress: WalletAddressSchema.describe(
        "The wallet address of a preconfigured recipient",
      ),
      receives: RecipientShareOutput,
    })
    .describe("A recipient that uses a preset configuration"),
  z
    .object({
      type: z.literal("CLAIMABLE"),
      giftedCurrency: TokenAmountOutputSchema.describe(
        "The amount of currency bundled in the contract, and gifted to the claimer upon creation",
      ),
      receives: RecipientShareOutput,
    })
    .describe(
      "A recipient that in yet unknown, but will claim the pending contract",
    ),
]);

const PendingRewardContract = z.object({
  delegateWalletAddress: WalletAddressSchema.describe(
    "The wallet address of the contract delegate. This wallet is capable of taking admin actions (delete) on the pending contract.",
  ),
  recipients: z
    .array(RecipientConfigOutput)
    .min(1)
    .max(6)
    .describe(
      "An exhaustive list of recipients and their respective shares in the reward contract",
    ),
  rewardSchedule: RewardSchedule.describe(
    "The schedule on which rewards would be distributed to recipients",
  ),
});

const ActiveRewardContract = z.object({
  delegateWalletAddress: WalletAddressSchema.describe(
    "The wallet address of the contract delegate. This wallet is capable of taking admin actions (delete) on the active contract.",
  ),
  entityOwnerAddress: WalletAddressSchema.describe(
    "The wallet address that owns the entity (hotspot)",
  ),
  recipients: z
    .array(
      z.object({
        walletAddress: WalletAddressSchema.describe(
          "The wallet address of the reward recipient",
        ),
        receives: RecipientShareOutput,
      }),
    )
    .min(1)
    .max(6)
    .describe(
      "An exhaustive list of recipients and their respective shares in the reward contract",
    ),
  rewardSchedule: RewardSchedule.describe(
    "The schedule on which rewards are distributed to recipients",
  ),
});

export const FindRewardContractResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("PENDING"),
    contract: PendingRewardContract,
  }),
  z.object({
    status: z.literal("ACTIVE"),
    contract: ActiveRewardContract,
  }),
  z.object({
    status: z.literal("NONE"),
  }),
]);

export const CreateRewardContractTransactionInputSchema = z.object({
  delegateWalletAddress: WalletAddressSchema.describe(
    "The wallet address of the contract delegate. This wallet is capable of taking admin actions (delete) on the contract.",
  ),
  recipients: z
    .array(RecipientConfigInput)
    .min(1)
    .max(6)
    .refine((arr) => arr.filter((s) => s.type === "CLAIMABLE").length <= 1, {
      message: "At most one recipient can be of type CLAIMABLE.",
    })
    .refine(
      (arr) => {
        const shareEntries = arr.filter((s) => s.receives.type === "SHARES");
        if (shareEntries.length === 0) {
          return true;
        }
        return (
          shareEntries.reduce(
            (acc, curr) =>
              acc +
              (curr.receives.type === "SHARES" ? curr.receives.shares : 0),
            0,
          ) === 100
        );
      },
      {
        message: "Total shares must equal 100.",
      },
    )
    .describe(
      "An exhaustive list of recipients and their respective shares in the reward contract",
    ),
  rewardSchedule: RewardSchedule.describe(
    "The schedule on which rewards would be distributed to recipients",
  ),
});

export const EstimateCostToCreateRewardContractResponseSchema = z.object({
  total: TokenAmountOutputSchema.describe("The total cost to create the contract."),
  lineItems: z.object({
    transactionFees: TokenAmountOutputSchema.describe("The cost of transaction fees, including funding for future scheduled transactions."),
    rentFee: TokenAmountOutputSchema.describe("The cost of the rent fee."),
    recipientGift: TokenAmountOutputSchema.describe("The total cost of gifted currency, bundled with the contract."),
  }).describe("A breakdown of the costs invovled. Should sum to the total cost.")
});

export const CreateRewardContractTransactionResponseSchema = z.object({
  unsignedTransactionData: TransactionDataSchema.describe(
    "The unsigned transaction data which, when signed and submitted will create the pending or finalized reward contract",
  ),
  estimatedSolFee: TokenAmountOutputSchema,
})

export const DeleteRewardContractTransactionResponseSchema = z.object({
  unsignedTransactionData: TransactionDataSchema.describe(
    "The unsigned transaction data which, when signed and submitted will delete the contract",
  ),
  estimatedSolFee: TokenAmountOutputSchema,
})

export const CreateInviteResponseSchema = z.object({
  unsignedMessage: z
    .string()
    .min(1)
    .describe(
      "The unsigned invite message which, when signed by the delegate's wallet, can be used by a recipient to claim the pending contract.",
    ),
  expiration: z.iso.datetime(),
});

export const ClaimInviteRequestSchema = z.object({
  delegateSignature: z
    .string()
    .min(1)
    .describe("The signed invite message provided by the contract delegate."),
  expiration: z.iso.datetime(),
});

export const ClaimInviteResponseSchema = z.object({
  unsignedTransactionData: TransactionDataSchema.describe(
    "The unsigned transaction data which, when signed and submitted will claim the pending reward contract",
  ),
  estimatedSolFee: TokenAmountOutputSchema,
})
