import { createSolanaConnection } from "@/lib/solana";
import {
  getBaseAutomationRentLamports,
  estimateAutomationFunding,
  calculatePeriodsRemaining,
  interpretCronString,
} from "@/lib/utils/automation-helpers";
import * as anchor from "@coral-xyz/anchor";
import { publicProcedure } from "../../../procedures";
import { fetchAutomationData } from "./automation-data-helpers";

/**
 * Get automation status including fees, remaining claims/time, and current state.
 */
export const getAutomationStatus =
  publicProcedure.hotspots.getAutomationStatus.handler(
    async ({ input, errors }) => {
      const { walletAddress } = input;

      const { provider } = createSolanaConnection(walletAddress);
      anchor.setProvider(provider);

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
      } = await fetchAutomationData(walletAddress, provider);

      // Price the status with the same helper as getFundingEstimate, at
      // additionalDuration: 0 (current state), so its fields sum to that estimate.
      const { rentFee, recipientFee, operationalSol } =
        estimateAutomationFunding({
          cronJobExists: !!cronJobAccount,
          baseAutomationRentLamports: cronJobAccount
            ? 0
            : await getBaseAutomationRentLamports(provider.connection),
          cronJobBalanceLamports,
          cronJobCostPerClaimLamports,
          pdaWalletBalanceLamports,
          pdaWalletCostPerClaimLamports,
          recipientRentLamports,
          cronJobRentLamports,
          pdaWalletRentLamports,
          additionalDuration: 0,
          ataRentLamports,
          taskReturnAccountFundingLamports,
        });

      // Calculate remaining claims and time
      let remainingClaims: number | undefined;
      let fundingPeriodInfo:
        | {
            periodLength: "daily" | "weekly" | "monthly";
            periodsRemaining: number;
            cronJobPeriodsRemaining: number;
            pdaWalletPeriodsRemaining: number;
          }
        | undefined;
      let currentSchedule:
        | {
            cron: string;
            schedule: "daily" | "weekly" | "monthly";
            time: string;
            nextRun: string;
          }
        | undefined;

      if (cronJobAccount?.schedule) {
        const scheduleInfo = interpretCronString(cronJobAccount.schedule);
        currentSchedule = {
          cron: cronJobAccount.schedule,
          schedule: scheduleInfo.schedule,
          time: scheduleInfo.time,
          nextRun: scheduleInfo.nextRun.toISOString(),
        };

        // Calculate periods remaining for each pool separately
        // Accounts for minimum rent requirements, recipient rent, ATA rent, and task return account funding
        const {
          periodsRemaining,
          periodLength,
          cronJobPeriodsRemaining,
          pdaWalletPeriodsRemaining,
        } = calculatePeriodsRemaining({
          schedule: scheduleInfo.schedule,
          cronJobBalanceLamports,
          cronJobCostPerClaimLamports,
          pdaWalletBalanceLamports,
          pdaWalletCostPerClaimLamports,
          recipientRentLamports,
          cronJobRentLamports,
          pdaWalletRentLamports,
          ataRentLamports,
          taskReturnAccountFundingLamports,
        });

        remainingClaims = periodsRemaining;
        fundingPeriodInfo = {
          periodLength,
          periodsRemaining,
          cronJobPeriodsRemaining,
          pdaWalletPeriodsRemaining,
        };
      }

      return {
        hasExistingAutomation:
          !!cronJobAccount && !cronJobAccount.removedFromQueue,
        isOutOfSol: cronJobAccount?.removedFromQueue || false,
        currentSchedule,
        rentFee,
        recipientFee,
        operationalSol,
        remainingClaims,
        fundingPeriodInfo,
        cronJobBalance: cronJobBalanceLamports.toString(),
        pdaWalletBalance: pdaWalletBalanceLamports.toString(),
      };
    },
  );
