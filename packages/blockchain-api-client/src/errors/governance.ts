import { z } from "zod";
import { SkippedPositionSchema } from "../schemas/governance";

/**
 * Every supplied position was skipped, so there are no vote transactions to
 * build. The skip report is still returned so the client can explain the
 * shortfall.
 */
export const ALL_POSITIONS_SKIPPED = {
  status: 400,
  message: "No votes to cast — all positions were skipped.",
  data: z.object({
    skipped: z.array(SkippedPositionSchema),
  }),
} as const;
