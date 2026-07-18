import { z } from "zod";
import { PublicKeySchema } from "./common";

/**
 * Shared inputs for a Squads v3 transaction vote (approve / reject / cancel).
 * v3 votes act directly on the transaction PDA (there is no separate proposal
 * account as in v4). The member casting the vote is also the fee payer for the
 * returned transaction.
 */
export const SquadsV3ProposalVoteInputSchema = z.object({
  member: PublicKeySchema.describe(
    "Wallet address of the multisig member casting the vote (signer and fee payer)"
  ),
  multisig: PublicKeySchema.describe("Multisig account PDA"),
  transactionPda: PublicKeySchema.describe(
    "PDA of the target Squads v3 transaction (MsTransaction account)"
  ),
});

export type SquadsV3ProposalVoteInput = z.infer<
  typeof SquadsV3ProposalVoteInputSchema
>;

/**
 * Input for executing an approved Squads v3 transaction. The server reads the
 * transaction account to assemble the inner instruction accounts, so only the
 * transaction PDA and acting member are required.
 */
export const SquadsV3ExecuteProposalInputSchema = z.object({
  member: PublicKeySchema.describe(
    "Wallet address of the multisig member executing the transaction (signer and fee payer)"
  ),
  multisig: PublicKeySchema.describe("Multisig account PDA"),
  transactionPda: PublicKeySchema.describe(
    "PDA of the approved Squads v3 transaction to execute"
  ),
});

export type SquadsV3ExecuteProposalInput = z.infer<
  typeof SquadsV3ExecuteProposalInputSchema
>;

/**
 * A single config change to include in a Squads v3 config-change proposal.
 * v3 expresses membership and threshold changes as program instructions
 * (addMember / removeMember / changeThreshold) wrapped in a proposed
 * transaction, unlike v4's distinct config-transaction type.
 */
export const SquadsV3ConfigActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("addMember"),
    newMember: PublicKeySchema.describe("Pubkey of the member to add"),
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

export type SquadsV3ConfigAction = z.infer<typeof SquadsV3ConfigActionSchema>;

/**
 * Input for proposing a Squads v3 config change. The server creates a
 * transaction at the multisig's next index, adds the config instruction(s),
 * and activates it; the assigned transaction PDA is returned in actionMetadata.
 */
export const SquadsV3ProposeConfigChangeInputSchema = z.object({
  member: PublicKeySchema.describe(
    "Wallet address of the multisig member creating the proposal (signer and fee payer)"
  ),
  multisig: PublicKeySchema.describe("Multisig account PDA"),
  actions: z
    .array(SquadsV3ConfigActionSchema)
    .nonempty()
    .describe("One or more config changes to apply when the proposal executes"),
});

export type SquadsV3ProposeConfigChangeInput = z.infer<
  typeof SquadsV3ProposeConfigChangeInputSchema
>;
