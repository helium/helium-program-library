import { cronJobTransactionKey } from "@helium/cron-sdk";
import { keyToAssetKey } from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import { HNT_MINT } from "@helium/spl-utils";
import { publicProcedure } from "../../../procedures";
import {
  buildAutomationTransactionResponse,
  resolveEntityClaimCronJob,
} from "./automation-transaction";

const HNT_DAO = daoKey(HNT_MINT)[0];

/**
 * Create a transaction to add a single hotspot's claim to an existing
 * automation. The cron claims that one entity each time it fires.
 */
export const addEntityToAutomation =
  publicProcedure.hotspots.addEntityToAutomation.handler(
    async ({ input, errors }) => {
      const { walletAddress, entityKey } = input;

      const { provider, hplCronsProgram, cronJob, cronJobAccount, wallet } =
        await resolveEntityClaimCronJob({
          walletAddress,
          notFoundMessage:
            "Automation not found. Please set up automation first.",
          errors,
        });

      const [keyToAsset] = keyToAssetKey(HNT_DAO, entityKey);

      const index = cronJobAccount.nextTransactionId || 0;
      const { instruction } = await hplCronsProgram.methods
        .addEntityToCronV0({ index })
        .accounts({
          keyToAsset,
          cronJob,
          cronJobTransaction: cronJobTransactionKey(cronJob, index)[0],
        })
        .prepare();

      return buildAutomationTransactionResponse({
        provider,
        instructions: [instruction],
        feePayer: wallet,
        tag: `add_entity_to_automation:${walletAddress}`,
        transactionMetadata: {
          type: "add_entity_to_automation",
          description: "Add hotspot claim to automation",
          entityKey,
          index,
        },
        actionMetadata: {
          type: "add_entity_to_automation",
          entityKey,
          index,
        },
      });
    },
  );
