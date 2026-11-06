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
    async ({ input, errors }) => {
      const { response, fitsOneBundle } = await buildAutomationSetup({
        ...input,
        claims: { kind: "wallet" },
        errors,
      });
      // A schedule change removes every existing claim first. With many
      // claims the setup does not fit one bundle, and the new cron could land
      // without its claim.
      if (!fitsOneBundle) {
        throw errors.BAD_REQUEST({
          message:
            "The automation has too many claims to change its schedule in one step. Close it first, then set it up again.",
        });
      }
      return response;
    }
  );
