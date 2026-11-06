import { publicProcedure } from "../../../procedures";
import { buildAutomationSetup } from "./automation-setup";

/**
 * Create transactions to set up claim automation with a whole-wallet claim,
 * so the wallet signs once and never holds a cron with no claims. The claim
 * is added only to a new cron or an existing cron with no claims; an existing
 * cron that already has claims is only funded.
 */
export const createWalletClaimAutomation =
  publicProcedure.hotspots.createWalletClaimAutomation.handler(
    async ({ input, errors }) =>
      (
        await buildAutomationSetup({
          ...input,
          claims: { kind: "wallet" },
          errors,
        })
      ).response,
  );
