import { createSolanaConnection, getCluster } from "@/lib/solana";
import {
  BASE_AUTOMATION_RENT,
  calculateFundingForAdditionalDuration,
  getScheduleCronString,
  interpretCronString,
} from "@/lib/utils/automation-helpers";
import * as anchor from "@coral-xyz/anchor";
import {
  cronJobKey,
  cronJobNameMappingKey,
  cronJobTransactionKey,
  init as initCron,
} from "@helium/cron-sdk";
import {
  entityCronAuthorityKey,
  init as initHplCrons,
} from "@helium/hpl-crons-sdk";
import {
  batchInstructionsToTxsWithPriorityFee,
  HELIUM_COMMON_LUT,
  HELIUM_COMMON_LUT_DEVNET,
  toVersionedTx,
} from "@helium/spl-utils";
import {
  init as initTuktuk,
  nextAvailableTaskIds,
  taskKey,
} from "@helium/tuktuk-sdk";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getTotalTransactionFees,
  BASE_TX_FEE_LAMPORTS,
} from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";
import { getJitoTipTransaction, shouldUseJitoBundle } from "@/lib/utils/jito";
import { publicProcedure } from "../../../procedures";
import { fetchAutomationData } from "./automation-data-helpers";
import { TASK_QUEUE_ID } from "@/lib/constants/tuktuk";

/**
 * Create transactions to set up claim automation for hotspots.
 */
export const createAutomation =
  publicProcedure.hotspots.createAutomation.handler(
    async ({ input, errors }) => {
      const { walletAddress, schedule, duration } = input;

      const wallet = new PublicKey(walletAddress);
      const { provider } = createSolanaConnection(walletAddress);
      anchor.setProvider(provider);

      // Initialize programs
      const hplCronsProgram = await initHplCrons(provider);
      const cronProgram = await initCron(provider);
      const tuktukProgram = await initTuktuk(provider);

      // Derive keys
      const authority = entityCronAuthorityKey(wallet)[0];
      const cronJob = cronJobKey(authority, 0)[0];

      const cronJobAccount =
        await cronProgram.account.cronJobV0.fetchNullable(cronJob);

      const instructions: TransactionInstruction[] = [];

      // If cronJob doesn't exist or schedule changed, create/recreate it
      if (
        !cronJobAccount ||
        (cronJobAccount.schedule &&
          interpretCronString(cronJobAccount.schedule).schedule !== schedule)
      ) {
        // If it exists but schedule changed, remove it first
        if (cronJobAccount) {
          const maxTxId = cronJobAccount.nextTransactionId || 0;
          const txIds = Array.from({ length: maxTxId }, (_, i) => i);

          instructions.push(
            ...(await Promise.all(
              txIds.map((txId) =>
                hplCronsProgram.methods
                  .removeEntityFromCronV0({
                    index: txId,
                  })
                  .accounts({
                    cronJob,
                    rentRefund: wallet,
                    cronJobTransaction: cronJobTransactionKey(cronJob, txId)[0],
                  })
                  .instruction(),
              ),
            )),
            await hplCronsProgram.methods
              .closeEntityClaimCronV0()
              .accounts({
                cronJob,
                rentRefund: wallet,
                cronJobNameMapping: cronJobNameMappingKey(
                  authority,
                  "entity_claim",
                )[0],
              })
              .instruction(),
          );
        }

        // Create new cron job
        // Fetch task queue fresh to ensure we have the latest state
        const freshTaskQueueAcc =
          await tuktukProgram.account.taskQueueV0.fetch(TASK_QUEUE_ID);
        const freshAvailableTaskIds = nextAvailableTaskIds(
          freshTaskQueueAcc.taskBitmap,
          1,
          false,
        );
        if (freshAvailableTaskIds.length === 0) {
          throw new Error("No available task IDs in task queue");
        }
        const freshTaskId = freshAvailableTaskIds[0];
        const [freshTask] = taskKey(TASK_QUEUE_ID, freshTaskId);

        const cronString = getScheduleCronString(schedule);
        instructions.push(
          await hplCronsProgram.methods
            .initEntityClaimCronV0({
              schedule: cronString,
            })
            .accounts({
              taskQueue: TASK_QUEUE_ID,
              cronJob,
              task: freshTask,
              cronJobNameMapping: cronJobNameMappingKey(
                authority,
                "entity_claim",
              )[0],
            })
            .instruction(),
        );
      } else if (cronJobAccount?.removedFromQueue) {
        // If cron exists but was removed from queue due to insufficient SOL, requeue it
        // Fetch task queue fresh to ensure we have the latest state
        const freshTaskQueueAcc =
          await tuktukProgram.account.taskQueueV0.fetch(TASK_QUEUE_ID);
        const freshAvailableTaskIds = nextAvailableTaskIds(
          freshTaskQueueAcc.taskBitmap,
          1,
          false,
        );
        if (freshAvailableTaskIds.length === 0) {
          throw new Error("No available task IDs in task queue");
        }
        const freshTaskId = freshAvailableTaskIds[0];
        const [freshTask] = taskKey(TASK_QUEUE_ID, freshTaskId);

        instructions.push(
          await hplCronsProgram.methods
            .requeueEntityClaimCronV0()
            .accounts({
              taskQueue: TASK_QUEUE_ID,
              cronJob,
              task: freshTask,
              cronJobNameMapping: cronJobNameMappingKey(
                authority,
                "entity_claim",
              )[0],
            })
            .instruction(),
        );
      }

      // fetchAutomationData always returns a valid object, even if cron job doesn't exist
      const {
        cronJobAccount: existingCronJobAccount,
        cronJobBalanceLamports,
        cronJobRentLamports,
        pdaWalletBalanceLamports,
        cronJobCostPerClaimLamports,
        pdaWalletCostPerClaimLamports,
        recipientRentLamports,
        ataRentLamports,
        taskReturnAccountRentLamports,
        pdaWallet,
      } = await fetchAutomationData(walletAddress, provider);

      // If cron job doesn't exist, estimate the rent that will be needed
      // This is important because the funding calculation needs to account for
      // rent that will be locked up when the account is created
      const effectiveCronJobRentLamports = existingCronJobAccount
        ? cronJobRentLamports
        : Math.ceil(BASE_AUTOMATION_RENT * LAMPORTS_PER_SOL);

      // ATA rent and task return account rent are included from automationData
      const { cronJobFundingLamports, pdaWalletFundingLamports } =
        calculateFundingForAdditionalDuration({
          cronJobBalanceLamports,
          cronJobCostPerClaimLamports,
          pdaWalletBalanceLamports,
          pdaWalletCostPerClaimLamports,
          recipientRentLamports,
          cronJobRentLamports: effectiveCronJobRentLamports,
          additionalDuration: duration,
          ataRentLamports,
          taskReturnAccountRentLamports,
        });

      // Always add at least minimal funding to ensure transaction is created
      const minCrankSolFee = Math.max(0, cronJobFundingLamports);
      const minPdaWalletSolFee = Math.max(0, pdaWalletFundingLamports);

      // Check wallet has sufficient balance (same pattern as fundAutomation)
      const totalFundingNeeded = minCrankSolFee + minPdaWalletSolFee;
      const walletBalance = await provider.connection.getBalance(wallet);
      const estimatedTxFees = BASE_TX_FEE_LAMPORTS * 2; // Estimate for multiple potential txs
      const totalNeededWithFees = totalFundingNeeded + estimatedTxFees;

      if (walletBalance < totalNeededWithFees) {
        throw errors.INSUFFICIENT_FUNDS({
          message: "Insufficient SOL balance to set up automation",
          data: {
            required: totalNeededWithFees,
            available: walletBalance,
          },
        });
      }

      if (!cronJobAccount) {
        const { instruction } = await hplCronsProgram.methods
          .addWalletToEntityCronV0({
            index: 0,
          })
          .accounts({
            wallet,
            cronJob,
            cronJobTransaction: cronJobTransactionKey(cronJob, 0)[0],
          })
          .prepare();

        instructions.push(instruction);
      }

      if (minCrankSolFee > 0) {
        instructions.push(
          SystemProgram.transfer({
            fromPubkey: wallet,
            toPubkey: cronJob,
            lamports: minCrankSolFee,
          }),
        );
      }

      if (minPdaWalletSolFee > 0) {
        instructions.push(
          SystemProgram.transfer({
            fromPubkey: wallet,
            toPubkey: pdaWallet,
            lamports: minPdaWalletSolFee,
          }),
        );
      }

      // Build and serialize transactions
      const vtxs = (
        await batchInstructionsToTxsWithPriorityFee(provider, instructions, {
          addressLookupTableAddresses: [
            process.env.NEXT_PUBLIC_SOLANA_CLUSTER?.trim() === "devnet"
              ? HELIUM_COMMON_LUT_DEVNET
              : HELIUM_COMMON_LUT,
          ],
          computeUnitLimit: 500000,
        })
      ).map((tx) => toVersionedTx(tx));

      // Add Jito tip if needed for mainnet bundles
      if (shouldUseJitoBundle(vtxs.length, getCluster())) {
        vtxs.push(await getJitoTipTransaction(wallet));
      }

      const txs: Array<string> = vtxs.map((tx) =>
        Buffer.from(tx.serialize()).toString("base64"),
      );

      // Estimated fee includes tx fees + operational funding (cronJob + pdaWallet)
      const txFees = getTotalTransactionFees(vtxs);
      const estimatedSolFeeLamports = txFees + totalFundingNeeded;

      return {
        transactionData: {
          transactions: txs.map((serialized) => ({
            serializedTransaction: serialized,
            metadata: {
              type: "setup_automation",
              description: "Set up hotspot claim automation",
              schedule,
              duration,
            },
          })),
          parallel: false,
          tag: `setup_automation:${walletAddress}`,
        },
        estimatedSolFee: toTokenAmountOutput(
          new BN(estimatedSolFeeLamports),
          NATIVE_MINT.toBase58(),
        ),
      };
    },
  );
