import { createSolanaConnection, getCluster } from "@/lib/solana";
import {
  estimateAutomationFunding,
  getBaseAutomationRentLamports,
  ENTITY_CLAIM_CRON_NAME,
  resolveScheduleToCron,
  scheduleChanged,
} from "@/lib/utils/automation-helpers";
import * as anchor from "@anchor-lang/core";
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
  serializeWithTipMetadata,
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

      const cronJobAccount =
        await cronProgram.account.cronJobV0.fetchNullable(cronJob);

      const instructions: TransactionInstruction[] = [];

      // If cronJob doesn't exist or schedule changed, create/recreate it
      const recreatesCronJob =
        !cronJobAccount ||
        (!!cronJobAccount.schedule &&
          scheduleChanged(cronJobAccount.schedule, schedule));
      if (recreatesCronJob) {
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
              cronJobAccount.nextTransactionId || 0,
            )),
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
                ENTITY_CLAIM_CRON_NAME,
              )[0],
            })
            .instruction(),
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
                ENTITY_CLAIM_CRON_NAME,
              )[0],
            })
            .instruction(),
        );
      }

      // fetchAutomationData always returns a valid object, even if cron job doesn't exist
      const {
        cronJobBalanceLamports,
        cronJobRentLamports,
        pdaWalletBalanceLamports,
        cronJobCostPerClaimLamports,
        pdaWalletCostPerClaimLamports,
        recipientRentLamports,
        pdaWalletRentLamports,
        ataRentLamports,
        taskReturnAccountFundingLamports,
        minCrankReward,
        pdaWallet,
      } = await fetchAutomationData(walletAddress, provider);

      // Price with the same helper as getFundingEstimate. When init runs (first
      // setup or a schedule change) init_entity_claim_cron_v0 pays the base
      // rent and the schedule task's crank reward from the wallet, so the cron
      // job transfer below carries neither and the total counts them once. The
      // new cron job starts empty, so it is funded for the whole duration.
      const {
        cronJobFundingLamports,
        pdaWalletFundingLamports,
        totalLamports,
      } = estimateAutomationFunding({
        cronJobExists: !recreatesCronJob,
        baseAutomationRentLamports: recreatesCronJob
          ? await getBaseAutomationRentLamports(
              provider.connection,
              cronSchedule.length,
            )
          : 0,
        minCrankRewardLamports: minCrankReward,
        cronJobBalanceLamports,
        cronJobCostPerClaimLamports,
        pdaWalletBalanceLamports,
        pdaWalletCostPerClaimLamports,
        recipientRentLamports,
        cronJobRentLamports,
        pdaWalletRentLamports,
        additionalDuration: duration,
        ataRentLamports,
        taskReturnAccountFundingLamports,
      });

      // Always add at least minimal funding to ensure transaction is created
      const minCrankSolFee = Math.max(0, cronJobFundingLamports);
      const minPdaWalletSolFee = Math.max(0, pdaWalletFundingLamports);

      // Check wallet has sufficient balance (same pattern as fundAutomation)
      const totalFundingNeeded = totalLamports;
      const walletBalance = await provider.connection.getBalance(wallet);
      const estimatedTxFees = BASE_TX_FEE_LAMPORTS * 2; // Estimate for multiple potential txs
      const cluster = getCluster();
      const estimatedJitoTipCost =
        cluster === "mainnet" || cluster === "mainnet-beta"
          ? getJitoTipAmountLamports()
          : 0;
      const totalNeededWithFees =
        totalFundingNeeded + estimatedTxFees + estimatedJitoTipCost;

      // The teardown runs before init and the transfers, so the old cron job's
      // lamports are back in the wallet by the time they spend. Lamports donated
      // to a cron job PDA with no data get no teardown, so they never come back.
      const teardownRefundLamports =
        cronJobAccount && recreatesCronJob ? cronJobBalanceLamports : 0;

      if (walletBalance + teardownRefundLamports < totalNeededWithFees) {
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
      const vtxs = await Promise.all(
        (
          await batchInstructionsToTxsWithPriorityFee(provider, instructions, {
            addressLookupTableAddresses: [
              process.env.NEXT_PUBLIC_SOLANA_CLUSTER?.trim() === "devnet"
                ? HELIUM_COMMON_LUT_DEVNET
                : HELIUM_COMMON_LUT,
            ],
            commitment: "finalized",
            version: 0,
            // Wallet-signed: guard ixs may be appended (see withPriorityFees).
            deriveLoadedAccountsDataSizeLimit: false,
          })
        ).map((tx) => toVersionedTx(tx)),
      );

      // Add Jito tip if needed for mainnet bundles
      const useJito = shouldUseJitoBundle(vtxs.length, getCluster());
      if (useJito) {
        vtxs.push(await getJitoTipTransaction(wallet));
      }

      // Estimated fee includes tx fees + setup rent and crank reward + operational funding (cronJob + pdaWallet)
      const txFees = await getTotalTransactionFees(provider.connection, vtxs);
      const estimatedSolFeeLamports = txFees + totalFundingNeeded;
      const effectiveSchedule = recreatesCronJob
        ? cronSchedule
        : cronJobAccount!.schedule;

      return {
        transactionData: {
          transactions: serializeWithTipMetadata(
            vtxs,
            {
              type: "setup_automation",
              description: "Set up hotspot claim automation",
              cronSchedule: effectiveSchedule,
              duration,
            },
            useJito,
          ),
          parallel: false,
          tag: `setup_automation:${walletAddress}`,
          actionMetadata: {
            type: "setup_automation",
            cronSchedule: effectiveSchedule,
            duration,
          },
        },
        estimatedSolFee: await toTokenAmountOutput(
          new BN(estimatedSolFeeLamports),
          NATIVE_MINT.toBase58(),
        ),
      };
    },
  );
