import { createSolanaConnection, getCluster } from "@/lib/solana";
import { ENTITY_CLAIM_CRON_NAME } from "@/lib/utils/automation-helpers";
import * as anchor from "@coral-xyz/anchor";
import {
  cronJobKey,
  cronJobNameMappingKey,
  init as initCron,
} from "@helium/cron-sdk";
import {
  entityCronAuthorityKey,
  init as initHplCrons,
} from "@helium/hpl-crons-sdk";
import {
  HELIUM_COMMON_LUT,
  HELIUM_COMMON_LUT_DEVNET,
  batchInstructionsToTxsWithPriorityFee,
  toVersionedTx,
} from "@helium/spl-utils";
import {
  init as initTuktuk,
  nextAvailableTaskIds,
  taskKey,
} from "@helium/tuktuk-sdk";
import { PublicKey } from "@solana/web3.js";
import { getJitoTipTransaction, shouldUseJitoBundle } from "@/lib/utils/jito";
import { publicProcedure } from "../../../procedures";
import { getTotalTransactionFees } from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";
import { TASK_QUEUE_ID } from "@/lib/constants/tuktuk";

/**
 * Create a transaction to requeue an automation that was removed from the task
 * queue after running out of SOL. Fund it first (fundAutomation) so it stays
 * queued.
 */
export const requeueAutomation =
  publicProcedure.hotspots.requeueAutomation.handler(
    async ({ input, errors }) => {
      const { walletAddress } = input;

      const wallet = new PublicKey(walletAddress);
      const { provider } = createSolanaConnection(walletAddress);
      anchor.setProvider(provider);

      const hplCronsProgram = await initHplCrons(provider);
      const cronProgram = await initCron(provider);
      const tuktukProgram = await initTuktuk(provider);

      const authority = entityCronAuthorityKey(wallet)[0];
      const cronJob = cronJobKey(authority, 0)[0];

      const cronJobAccount = await cronProgram.account.cronJobV0.fetchNullable(
        cronJob
      );
      if (!cronJobAccount) {
        throw errors.NOT_FOUND({ message: "Automation not found" });
      }

      const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(
        TASK_QUEUE_ID
      );
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
              ENTITY_CLAIM_CRON_NAME
            )[0],
          })
          .instruction(),
      ];

      const vtxs = (
        await batchInstructionsToTxsWithPriorityFee(provider, instructions, {
          addressLookupTableAddresses: [
            process.env.NEXT_PUBLIC_SOLANA_CLUSTER?.trim() === "devnet"
              ? HELIUM_COMMON_LUT_DEVNET
              : HELIUM_COMMON_LUT,
          ],
          computeUnitLimit: 500000,
          commitment: "finalized",
        })
      ).map((tx) => toVersionedTx(tx));

      if (shouldUseJitoBundle(vtxs.length, getCluster())) {
        vtxs.push(await getJitoTipTransaction(wallet));
      }

      const txs = vtxs.map((tx) =>
        Buffer.from(tx.serialize()).toString("base64")
      );
      const txFees = getTotalTransactionFees(vtxs);

      return {
        transactionData: {
          transactions: txs.map((serialized) => ({
            serializedTransaction: serialized,
            metadata: {
              type: "requeue_automation",
              description: "Requeue hotspot claim automation",
            },
          })),
          parallel: false,
          tag: `requeue_automation:${walletAddress}`,
          actionMetadata: { type: "requeue_automation" },
        },
        estimatedSolFee: await toTokenAmountOutput(
          new BN(txFees),
          NATIVE_MINT.toBase58()
        ),
      };
    }
  );
