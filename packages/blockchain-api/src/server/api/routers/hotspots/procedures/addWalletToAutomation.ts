import { cronJobTransactionKey } from "@helium/cron-sdk";
import { publicProcedure } from "../../../procedures";
import {
  buildAutomationTransactionResponse,
  resolveEntityClaimCronJob,
} from "./automation-transaction";

/**
 * Create a transaction to add a whole-wallet claim to an existing automation.
 * The cron will claim every hotspot the wallet owns each time it fires.
 */
export const addWalletToAutomation =
  publicProcedure.hotspots.addWalletToAutomation.handler(
    async ({ input, errors }) => {
      const { walletAddress } = input;

      const { provider, hplCronsProgram, cronJob, cronJobAccount, wallet } =
        await resolveEntityClaimCronJob({
          walletAddress,
          notFoundMessage:
            "Automation not found. Please set up automation first.",
          errors,
        });

      const index = cronJobAccount.nextTransactionId || 0;
      const { instruction } = await hplCronsProgram.methods
        .addWalletToEntityCronV0({ index })
        .accounts({
          wallet,
          cronJob,
          cronJobTransaction: cronJobTransactionKey(cronJob, index)[0],
        })
        .prepare();

      return buildAutomationTransactionResponse({
        provider,
        instructions: [instruction],
        feePayer: wallet,
        tag: `add_wallet_to_automation:${walletAddress}`,
        transactionMetadata: {
          type: "add_wallet_to_automation",
          description: "Add whole-wallet claim to automation",
          index,
        },
        actionMetadata: {
          type: "add_wallet_to_automation",
          index,
        },
      });
    },
  );
