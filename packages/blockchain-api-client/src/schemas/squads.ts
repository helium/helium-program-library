import { z } from "zod";
import { PublicKeySchema } from "./common";

/**
 * A transaction index within a Squads v4 multisig, encoded as a decimal
 * string because on-chain indices are u64 and can exceed Number.MAX_SAFE_INTEGER.
 */
const TransactionIndexSchema = z
  .string()
  .regex(/^\d+$/, "transactionIndex must be a whole number")
  .describe("Squads transaction index of the target proposal (u64 as string)");

/**
 * Shared inputs for a proposal vote (approve / reject / cancel). The member
 * casting the vote is also the fee payer for the returned transaction.
 */
export const SquadsProposalVoteInputSchema = z.object({
  member: PublicKeySchema.describe(
    "Wallet address of the multisig member casting the vote (signer and fee payer)"
  ),
  multisig: PublicKeySchema.describe("Multisig account PDA"),
  transactionIndex: TransactionIndexSchema,
  memo: z.string().optional().describe("Optional memo recorded on the vote"),
});

export type SquadsProposalVoteInput = z.infer<
  typeof SquadsProposalVoteInputSchema
>;

/**
 * Input for executing an approved proposal. Handles both vault and config
 * transactions; the server detects which kind the target index holds.
 */
export const SquadsExecuteProposalInputSchema = z.object({
  member: PublicKeySchema.describe(
    "Wallet address of the multisig member executing the proposal (signer and fee payer)"
  ),
  multisig: PublicKeySchema.describe("Multisig account PDA"),
  transactionIndex: TransactionIndexSchema,
});

export type SquadsExecuteProposalInput = z.infer<
  typeof SquadsExecuteProposalInputSchema
>;

/**
 * Member permissions for an AddMember config action. Mirrors the Squads v4
 * permission bits: initiate (propose), vote, execute.
 */
export const SquadsPermissionSchema = z.enum(["initiate", "vote", "execute"]);

/**
 * A single config change to include in a config-transaction proposal.
 */
export const SquadsConfigActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("addMember"),
    newMember: PublicKeySchema.describe("Pubkey of the member to add"),
    permissions: z
      .array(SquadsPermissionSchema)
      .nonempty()
      .optional()
      .describe(
        "Permissions granted to the new member. Defaults to all three (initiate, vote, execute)."
      ),
  }),
  z.object({
    type: z.literal("removeMember"),
    oldMember: PublicKeySchema.describe("Pubkey of the member to remove"),
  }),
  z.object({
    type: z.literal("changeThreshold"),
    newThreshold: z
      .number()
      .int()
      .min(1)
      .describe("New approval threshold for the multisig"),
  }),
]);

export type SquadsConfigAction = z.infer<typeof SquadsConfigActionSchema>;

/**
 * Input for proposing a config change (add/remove member, change threshold).
 * The server creates a config transaction plus its proposal at the multisig's
 * next transaction index, returned in actionMetadata.
 */
export const SquadsProposeConfigChangeInputSchema = z.object({
  member: PublicKeySchema.describe(
    "Wallet address of the multisig member creating the proposal (signer and fee payer)"
  ),
  multisig: PublicKeySchema.describe("Multisig account PDA"),
  actions: z
    .array(SquadsConfigActionSchema)
    .nonempty()
    .describe("One or more config changes to apply when the proposal executes"),
  memo: z
    .string()
    .optional()
    .describe("Optional memo recorded on the proposal"),
});

export type SquadsProposeConfigChangeInput = z.infer<
  typeof SquadsProposeConfigChangeInputSchema
>;
