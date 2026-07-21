import { createSolanaConnection, getCluster } from "@/lib/solana";
import {
  BASE_AUTOMATION_RENT,
  calculateFundingForAdditionalDuration,
  ENTITY_CLAIM_CRON_NAME,
  resolveScheduleToCron,
} from "@/lib/utils/automation-helpers";
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
  batchInstructionsToTxsWithPriorityFee,
  HELIUM_COMMON_LUT,
  HELIUM_COMMON_LUT_DEVNET,
  toVersionedTx,
} from "@helium/spl-utils";
import { init as initTuktuk } from "@helium/tuktuk-sdk";
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
import {
  getJitoTipAmountLamports,
  getJitoTipTransaction,
  shouldUseJitoBundle,
} from "@/lib/utils/jito";
import { publicProcedure } from "../../../procedures";
import {
  buildTeardownInstructions,
  fetchAutomationData,
  nextFreeTaskKey,
} from "./automation-data-helpers";
import { TASK_QUEUE_ID } from "@/lib/constants/tuktuk";

/**
 * Create transactions to set up claim automation for hotspots.
 */
export const createAutomation =
  publicProcedure.hotspots.createAutomation.handler(
    async ({ input, errors }) => {
      const { walletAddress, schedule, duration } = input;
      // Accept a preset (daily/weekly/monthly) or a raw crontab; presets map to
      // a crontab here so everything downstream deals in a single cron string.
      const cronSchedule = resolveScheduleToCron(schedule);

      const wallet = new PublicKey(walletAddress);
      const { provider } = createSolanaConnection(walletAddress);
      anchor.setProvider(provider);

      // Initialize programs
      const hplCronsProgram = await initHplCrons(provider);
      const cronProgram = await initCron(provider);
      const tuktukProgram = await initTuktuk(provider);

      // Derive keys. hpl_crons pins a single entity-claim cron per wallet
      // (id 0, name "entity_claim"), so both are fixed.
      const authority = entityCronAuthorityKey(wallet)[0];
      const cronJob = cronJobKey(authority, 0)[0];

      const cronJobAccount = await cronProgram.account.cronJobV0.fetchNullable(
        cronJob
      );

      const instructions: TransactionInstruction[] = [];

      // If cronJob doesn't exist or schedule changed, create/recreate it
      if (
        !cronJobAccount ||
        (cronJobAccount.schedule && cronJobAccount.schedule !== cronSchedule)
      ) {
        // If it exists but schedule changed, remove it first. Skip holes left
        // by individually-removed claims (nextTransactionId is monotonic).
        if (cronJobAccount) {
          instructions.push(
            ...(await buildTeardownInstructions(
              provider.connection,
              hplCronsProgram,
              cronJob,
              authority,
              wallet,
              cronJobAccount.nextTransactionId || 0
            ))
          );
        }

        // Create new cron job. Fetch the task queue fresh to get the latest state.
        const freshTask = await nextFreeTaskKey(tuktukProgram);

        instructions.push(
          await hplCronsProgram.methods
            .initEntityClaimCronV0({
              schedule: cronSchedule,
            })
            .accounts({
              taskQueue: TASK_QUEUE_ID,
              cronJob,
              task: freshTask,
              cronJobNameMapping: cronJobNameMappingKey(
                authority,
                ENTITY_CLAIM_CRON_NAME
              )[0],
            })
            .instruction()
        );
      } else if (cronJobAccount?.removedFromQueue) {
        // If cron exists but was removed from queue due to insufficient SOL,
        // requeue it. Fetch the task queue fresh to get the latest state.
        const freshTask = await nextFreeTaskKey(tuktukProgram);

        instructions.push(
          await hplCronsProgram.methods
            .requeueEntityClaimCronV0()
            .accounts({
              taskQueue: TASK_QUEUE_ID,
              cronJob,
              task: freshTask,
              cronJobNameMapping: cronJobNameMappingKey(
                authority,
                ENTITY_CLAIM_CRON_NAME
              )[0],
            })
            .instruction()
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
      const cluster = getCluster();
      const estimatedJitoTipCost =
        cluster === "mainnet" || cluster === "mainnet-beta"
          ? getJitoTipAmountLamports()
          : 0;
      const totalNeededWithFees =
        totalFundingNeeded + estimatedTxFees + estimatedJitoTipCost;

      if (walletBalance < totalNeededWithFees) {
        throw errors.INSUFFICIENT_FUNDS({
          message: "Insufficient SOL balance to set up automation",
          data: {
            required: totalNeededWithFees,
            available: walletBalance,
          },
        });
      }

      // Note: this only sets up (and funds) the cron itself. Claims are added
      // separately via addWalletToAutomation / addEntityToAutomation, so the
      // same cron can mix whole-wallet and per-hotspot claims.

      if (minCrankSolFee > 0) {
        instructions.push(
          SystemProgram.transfer({
            fromPubkey: wallet,
            toPubkey: cronJob,
            lamports: minCrankSolFee,
          })
        );
      }

      if (minPdaWalletSolFee > 0) {
        instructions.push(
          SystemProgram.transfer({
            fromPubkey: wallet,
            toPubkey: pdaWallet,
            lamports: minPdaWalletSolFee,
          })
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
          commitment: "finalized",
        })
      ).map((tx) => toVersionedTx(tx));

      // Add Jito tip if needed for mainnet bundles
      if (shouldUseJitoBundle(vtxs.length, getCluster())) {
        vtxs.push(await getJitoTipTransaction(wallet));
      }

      const txs: Array<string> = vtxs.map((tx) =>
        Buffer.from(tx.serialize()).toString("base64")
      );

      // Estimated fee includes tx fees + operational funding (cronJob + pdaWallet)
      const txFees = await getTotalTransactionFees(provider.connection, vtxs);
      const estimatedSolFeeLamports = txFees + totalFundingNeeded;

      return {
        transactionData: {
          transactions: txs.map((serialized) => ({
            serializedTransaction: serialized,
            metadata: {
              type: "setup_automation",
              description: "Set up hotspot claim automation",
              cronSchedule,
              duration,
            },
          })),
          parallel: false,
          tag: `setup_automation:${walletAddress}`,
          actionMetadata: { type: "setup_automation", cronSchedule, duration },
        },
        estimatedSolFee: await toTokenAmountOutput(
          new BN(estimatedSolFeeLamports),
          NATIVE_MINT.toBase58()
        ),
      };
    }
  );
