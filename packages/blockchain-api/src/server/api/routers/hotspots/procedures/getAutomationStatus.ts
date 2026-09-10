import { createSolanaConnection } from "@/lib/solana";
import {
  getBaseAutomationRentLamports,
  TASK_RETURN_ACCOUNT_SIZE,
  calculateFundingForAdditionalDuration,
  calculatePeriodsRemaining,
  interpretCronString,
} from "@/lib/utils/automation-helpers";
import * as anchor from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
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
        taskReturnAccountRentLamports,
      } = await fetchAutomationData(walletAddress, provider);

      // Calculate funding needed using the same helper as getFundingEstimate
      // Using additionalDuration: 0 to get baseline funding needed (for current state)
      const { cronJobFundingLamports, pdaWalletFundingLamports } =
        calculateFundingForAdditionalDuration({
          cronJobBalanceLamports,
          cronJobCostPerClaimLamports,
          pdaWalletBalanceLamports,
          pdaWalletCostPerClaimLamports,
          recipientRentLamports,
          cronJobRentLamports,
          pdaWalletRentLamports,
          additionalDuration: 0,
          ataRentLamports,
          taskReturnAccountRentLamports,
        });

      const rentFee = cronJobAccount
        ? 0
        : (await getBaseAutomationRentLamports(provider.connection)) /
            LAMPORTS_PER_SOL +
          TASK_RETURN_ACCOUNT_SIZE;
      const recipientFee = recipientRentLamports / LAMPORTS_PER_SOL;
      const operationalSol =
        (cronJobFundingLamports + pdaWalletFundingLamports) / LAMPORTS_PER_SOL;

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
        // Accounts for minimum rent requirements, recipient rent, ATA rent, and task return account rent
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
          taskReturnAccountRentLamports,
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
