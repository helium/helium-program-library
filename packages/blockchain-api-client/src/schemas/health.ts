import { z } from "zod";

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
