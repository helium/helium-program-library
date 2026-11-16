import { publicProcedure } from "../../../procedures";
import { createSolanaConnection } from "@/lib/solana";
import * as anchor from "@anchor-lang/core";
import {
  getBaseAutomationRentLamports,
  getRequeueTaskRentLamports,
  estimateAutomationFunding,
  maxScheduleCronLength,
  requeuesCronJob as requeuesCronJobFor,
  scheduleChanged,
} from "@/lib/utils/automation-helpers";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { fetchAutomationData } from "./automation-data-helpers";
import { priceSetupClaims } from "./automation-setup";

/**
 * Get funding estimate for automation without constructing transactions.
 * Returns funding estimate even when automation doesn't exist yet, including initial setup rent.
 */
export const getFundingEstimate =
  publicProcedure.hotspots.getFundingEstimate.handler(
    async ({ input, errors }) => {
      const { walletAddress, duration, schedule, claims } = input;

      const { provider } = createSolanaConnection(walletAddress);
      anchor.setProvider(provider);

      const automationData = await fetchAutomationData(walletAddress, provider);

      const {
        cronJobAccount,
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
      } = automationData;

      // createAutomation re-creates a cron job on another schedule, so with a
      // schedule given, price that as a new cron job too.
      const recreatesCronJob =
        !cronJobAccount ||
        (schedule !== undefined &&
          !!cronJobAccount.schedule &&
          scheduleChanged(cronJobAccount.schedule, schedule));
      // A cron job removed from the queue is requeued, as the setup does.
      const requeuesCronJob = requeuesCronJobFor(
        cronJobAccount,
        recreatesCronJob,
      );

      // Price the claims a claim setup adds the same way it does.
      const claimPricing = await priceSetupClaims({
        connection: provider.connection,
        wallet: new PublicKey(walletAddress),
        claims,
        cronJobAccount,
        recreatesCronJob,
        minCrankReward,
      });
      const claimRentLamports = claimPricing?.claimRentLamports ?? 0;

      const funding = estimateAutomationFunding({
        cronJobExists: !recreatesCronJob,
        baseAutomationRentLamports: recreatesCronJob
          ? await getBaseAutomationRentLamports(
              provider.connection,
              schedule === undefined
                ? undefined
                : maxScheduleCronLength(schedule),
            )
          : 0,
        minCrankRewardLamports: minCrankReward,
        requeueTaskRentLamports: requeuesCronJob
          ? await getRequeueTaskRentLamports(provider.connection)
          : undefined,
        cronJobBalanceLamports,
        cronJobCostPerClaimLamports:
          claimPricing?.cronJobCostPerClaimLamports ??
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

      return {
        rentFee:
          (funding.rentFeeLamports + claimRentLamports) / LAMPORTS_PER_SOL,
        cronJobFunding: funding.cronJobFundingLamports / LAMPORTS_PER_SOL,
        pdaWalletFunding: funding.pdaWalletFundingLamports / LAMPORTS_PER_SOL,
        recipientFee: funding.recipientFeeLamports / LAMPORTS_PER_SOL,
        operationalSol: funding.operationalLamports / LAMPORTS_PER_SOL,
        totalSolNeeded:
          (funding.totalLamports + claimRentLamports) / LAMPORTS_PER_SOL,
        currentCronJobBalance: cronJobBalanceLamports.toString(),
        currentPdaWalletBalance: pdaWalletBalanceLamports.toString(),
      };
    }
  );
