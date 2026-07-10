import { ENTITY_CLAIM_CRON_NAME } from "@/lib/utils/automation-helpers";
import { cronJobNameMappingKey } from "@helium/cron-sdk";
import {
  init as initTuktuk,
  nextAvailableTaskIds,
  taskKey,
} from "@helium/tuktuk-sdk";
import { publicProcedure } from "../../../procedures";
import { TASK_QUEUE_ID } from "@/lib/constants/tuktuk";
import {
  buildAutomationTransactionResponse,
  resolveEntityClaimCronJob,
} from "./automation-transaction";

/**
 * Create a transaction to requeue an automation that was removed from the task
 * queue after running out of SOL. Fund it first (fundAutomation) so it stays
 * queued.
 */
export const requeueAutomation =
  publicProcedure.hotspots.requeueAutomation.handler(
    async ({ input, errors }) => {
      const { walletAddress } = input;

      const { provider, hplCronsProgram, cronJob, authority, wallet } =
        await resolveEntityClaimCronJob({
          walletAddress,
          notFoundMessage: "Automation not found",
          errors,
        });

      const tuktukProgram = await initTuktuk(provider);
      const taskQueueAcc =
        await tuktukProgram.account.taskQueueV0.fetch(TASK_QUEUE_ID);
      const [taskId] = nextAvailableTaskIds(taskQueueAcc.taskBitmap, 1, false);
      const [task] = taskKey(TASK_QUEUE_ID, taskId);

      const instructions = [
        await hplCronsProgram.methods
          .requeueEntityClaimCronV0()
          .accounts({
            taskQueue: TASK_QUEUE_ID,
            cronJob,
            task,
            cronJobNameMapping: cronJobNameMappingKey(
              authority,
              ENTITY_CLAIM_CRON_NAME,
            )[0],
          })
          .instruction(),
      ];

      return buildAutomationTransactionResponse({
        provider,
        instructions,
        feePayer: wallet,
        tag: `requeue_automation:${walletAddress}`,
        transactionMetadata: {
          type: "requeue_automation",
          description: "Requeue hotspot claim automation",
        },
        actionMetadata: { type: "requeue_automation" },
      });
    },
  );
