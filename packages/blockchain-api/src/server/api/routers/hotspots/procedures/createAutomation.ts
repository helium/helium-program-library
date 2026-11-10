import { publicProcedure } from "../../../procedures";
import { buildAutomationSetup } from "./automation-setup";

/**
 * Create transactions to set up claim automation for hotspots.
 *
 * This only sets up (and funds) the cron itself. Claims are added separately
 * via addWalletToAutomation / addEntityToAutomation, so the same cron can mix
 * whole-wallet and per-hotspot claims. createWalletClaimAutomation and
 * createEntityClaimAutomation do both in one signing round.
 */
export const createAutomation =
  publicProcedure.hotspots.createAutomation.handler(
    async ({ input, errors }) =>
      (await buildAutomationSetup({ ...input, errors })).response,
  );
