import { keyToAssetKey } from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import { HNT_MINT } from "@helium/spl-utils";
import { createSolanaConnection } from "@/lib/solana";
import { publicProcedure } from "../../../procedures";
import { buildAutomationSetup } from "./automation-setup";

const HNT_DAO = daoKey(HNT_MINT)[0];

/**
 * Create transactions to set up claim automation with one claim per hotspot,
 * so the wallet signs once and never holds a cron with no claims. The claims
 * are added only to a new cron or an existing cron with no claims; an
 * existing cron that already has claims is only funded.
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

      const { response, fitsOneBundle } = await buildAutomationSetup({
        ...setup,
        claims: { kind: "entities", entityKeys },
        errors,
      });
      // Transactions past one bundle could land without the rest.
      if (!fitsOneBundle) {
        throw errors.BAD_REQUEST({
          message:
            "Too many hotspots for one setup. Set up with fewer, then add the rest with addEntityToAutomation.",
        });
      }
      return response;
    }
  );
