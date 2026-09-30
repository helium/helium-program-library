import { publicProcedure } from "../../../procedures";
import { createSolanaConnection } from "@/lib/solana";
import * as anchor from "@coral-xyz/anchor";
import {
  getBaseAutomationRentLamports,
  estimateAutomationFunding,
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

      const funding = estimateAutomationFunding({
        cronJobExists: !!cronJobAccount,
        baseAutomationRentLamports: cronJobAccount
          ? 0
          : await getBaseAutomationRentLamports(
              provider.connection,
              schedule === undefined
                ? undefined
                : resolveScheduleToCron(schedule).length,
            ),
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
