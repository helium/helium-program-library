import { z } from "zod";

export const BridgeWebhookInputSchema = z.object({
  type: z.string(),
  kyc_link_id: z.string().optional(),
  kyc_status: z.string().optional(),
  tos_status: z.string().optional(),
  customer_id: z.string().optional(),
});

export const BridgeWebhookOutputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

export type BridgeWebhookInput = z.infer<typeof BridgeWebhookInputSchema>;
export type BridgeWebhookOutput = z.infer<typeof BridgeWebhookOutputSchema>;
