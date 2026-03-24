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
    .describe("Amount of DC to mint (in smallest unit). Provide either dcAmount or hntAmount."),
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
