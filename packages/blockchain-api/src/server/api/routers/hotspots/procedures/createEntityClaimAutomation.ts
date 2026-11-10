import { keyToAssetKey } from "@helium/helium-entity-manager-sdk";
import { createSolanaConnection } from "@/lib/solana";
import { publicProcedure } from "../../../procedures";
import { buildAutomationSetup, HNT_DAO } from "./automation-setup";

/**
 * Create transactions to set up claim automation with one claim per hotspot,
 * so the wallet signs once and never holds a cron with no claims. The claims
 * are added only to a new cron or an existing cron with no claims. On the
 * same schedule, a cron that already has claims is only funded; a schedule
 * change removes every claim and the new cron gets only these.
 */
export const createEntityClaimAutomation =
  publicProcedure.hotspots.createEntityClaimAutomation.handler(
    async ({ input, errors }) => {
      const { entityKeys, ...setup } = input;

      // add_entity_to_cron_v0 needs each hotspot's key-to-asset account.
      const { connection } = createSolanaConnection(setup.walletAddress);
      const keyToAssets = await connection.getMultipleAccountsInfo(
        entityKeys.map((entityKey) => keyToAssetKey(HNT_DAO, entityKey)[0]),
        { dataSlice: { offset: 0, length: 0 } }
      );
      const missing = entityKeys.filter((_, i) => !keyToAssets[i]);
      if (missing.length > 0) {
        throw errors.NOT_FOUND({
          message: `Hotspot not found: ${missing.join(", ")}`,
        });
      }

      const { response } = await buildAutomationSetup({
        ...setup,
        claims: { kind: "entities", entityKeys },
        errors,
      });
      return response;
    }
  );
