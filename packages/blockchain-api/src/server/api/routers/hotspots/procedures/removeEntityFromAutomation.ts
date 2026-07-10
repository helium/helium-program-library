import { cronJobTransactionKey } from "@helium/cron-sdk";
import { publicProcedure } from "../../../procedures";
import {
  buildAutomationTransactionResponse,
  resolveEntityClaimCronJob,
} from "./automation-transaction";

/**
 * Create a transaction to remove a single claim entry (by its cron transaction
 * index) from an existing automation. The freed rent is refunded to the wallet.
 */
export const removeEntityFromAutomation =
  publicProcedure.hotspots.removeEntityFromAutomation.handler(
    async ({ input, errors }) => {
      const { walletAddress, index } = input;

      const { provider, hplCronsProgram, cronJob, cronJobAccount, wallet } =
        await resolveEntityClaimCronJob({
          walletAddress,
          notFoundMessage: "Automation not found",
          errors,
        });

      if (index >= (cronJobAccount.nextTransactionId || 0)) {
        throw errors.NOT_FOUND({
          message: `Automation has no claim entry at index ${index}`,
        });
      }

      const instructions = [
        await hplCronsProgram.methods
          .removeEntityFromCronV0({ index })
          .accounts({
            cronJob,
            rentRefund: wallet,
            cronJobTransaction: cronJobTransactionKey(cronJob, index)[0],
          })
          .instruction(),
      ];

      return buildAutomationTransactionResponse({
        provider,
        instructions,
        feePayer: wallet,
        tag: `remove_entity_from_automation:${walletAddress}`,
        transactionMetadata: {
          type: "remove_entity_from_automation",
          description: "Remove claim from automation",
          index,
        },
        actionMetadata: {
          type: "remove_entity_from_automation",
          index,
        },
      });
    },
  );
