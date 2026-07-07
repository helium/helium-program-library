import { z } from "zod";
import { PublicKeySchema } from "./common";

export const MintDataCreditsInputSchema = z.object({
  owner: PublicKeySchema.describe(
    "Wallet address of the user minting data credits (used as fee payer and HNT source)"
  ),
  dcAmount: z
    .string()
    .regex(/^\d+$/, "Amount must be a whole number")
    .optional()
    .describe(
      "Amount of DC to mint (in smallest unit). Provide either dcAmount or hntAmount."
    ),
  hntAmount: z
    .string()
    .regex(/^\d+$/, "Amount must be a whole number in bones")
    .optional()
    .describe(
      "Amount of HNT to burn (in bones, 1 HNT = 100000000 bones). Provide either dcAmount or hntAmount."
    ),
  recipient: PublicKeySchema.optional().describe(
    "Recipient wallet for the minted DC. Defaults to the owner."
  ),
});

export type MintDataCreditsInput = z.infer<typeof MintDataCreditsInputSchema>;

export const DelegateDataCreditsInputSchema = z.object({
  owner: PublicKeySchema.describe(
    "Wallet address of the DC owner (signer and fee payer)"
  ),
  routerKey: z
    .string()
    .min(1)
    .describe("Router key string to delegate data credits to"),
  amount: z
    .string()
    .regex(/^\d+$/, "Amount must be a whole number")
    .describe("Amount of DC to delegate (in smallest unit, DC has 0 decimals)"),
  mint: PublicKeySchema.describe(
    "SubDAO token mint (e.g. MOBILE or IOT mint) to determine which subDAO to delegate to"
  ),
  memo: z
    .string()
    .optional()
    .describe("Optional memo to include in the transaction"),
});

export type DelegateDataCreditsInput = z.infer<
  typeof DelegateDataCreditsInputSchema
>;

export const BurnDataCreditsInputSchema = z.object({
  owner: PublicKeySchema.describe(
    "Wallet address burning the data credits (signer and fee payer)"
  ),
  amount: z
    .string()
    .regex(/^\d+$/, "Amount must be a whole number")
    .describe("Amount of DC to burn (smallest unit, DC has 0 decimals)"),
  multisig: PublicKeySchema.optional().describe(
    "If set, burn from this multisig's vault as a Squads v4 proposal. `owner` is the proposing member and outer fee payer."
  ),
  memo: z
    .string()
    .optional()
    .describe("Optional memo recorded on the Squads proposal (multisig mode)"),
});

export type BurnDataCreditsInput = z.infer<typeof BurnDataCreditsInputSchema>;
