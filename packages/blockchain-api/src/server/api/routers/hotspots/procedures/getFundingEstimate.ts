import { publicProcedure } from "../../../procedures";
import { createSolanaConnection } from "@/lib/solana";
import * as anchor from "@coral-xyz/anchor";
import {
  getBaseAutomationRentLamports,
  estimateAutomationFunding,
  maxScheduleCronLength,
  resolveScheduleToCron,
} from "@/lib/utils/automation-helpers";
import { fetchAutomationData } from "./automation-data-helpers";

/**
 * Get funding estimate for automation without constructing transactions.
 * Returns funding estimate even when automation doesn't exist yet, including initial setup rent.
 */
export const getFundingEstimate =
  publicProcedure.hotspots.getFundingEstimate.handler(
    async ({ input, errors }) => {
      const { walletAddress, duration, schedule } = input;

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
          cronJobAccount.schedule !== resolveScheduleToCron(schedule));

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

      return {
        ...funding,
        currentCronJobBalance: cronJobBalanceLamports.toString(),
        currentPdaWalletBalance: pdaWalletBalanceLamports.toString(),
      };
    }
  );
