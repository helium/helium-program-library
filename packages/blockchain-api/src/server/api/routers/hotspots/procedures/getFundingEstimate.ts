import { publicProcedure } from "../../../procedures";
import { createSolanaConnection } from "@/lib/solana";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {
  BASE_AUTOMATION_RENT,
  TASK_RETURN_ACCOUNT_SIZE,
  PDA_WALLET_RENT_LAMPORTS,
  calculateFundingForAdditionalDuration,
} from "@/lib/utils/automation-helpers";
import { fetchAutomationData } from "./automation-data-helpers";

/**
 * Get funding estimate for automation without constructing transactions.
 * Returns funding estimate even when automation doesn't exist yet, including initial setup rent.
 */
export const getFundingEstimate =
  publicProcedure.hotspots.getFundingEstimate.handler(
    async ({ input, errors }) => {
      const { walletAddress, duration } = input;

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
        ataRentLamports,
        taskReturnAccountRentLamports,
      } = automationData;

      // Calculate initial setup rent if automation doesn't exist
      // This matches the logic in getAutomationStatus
      const rentFee = cronJobAccount
        ? 0
        : BASE_AUTOMATION_RENT + TASK_RETURN_ACCOUNT_SIZE;

      const {
        cronJobFundingLamports,
        pdaWalletFundingLamports,
        recipientFeeLamports,
      } = calculateFundingForAdditionalDuration({
        cronJobBalanceLamports,
        cronJobCostPerClaimLamports,
        pdaWalletBalanceLamports,
        pdaWalletCostPerClaimLamports,
        recipientRentLamports,
        cronJobRentLamports,
        additionalDuration: duration,
        ataRentLamports,
        taskReturnAccountRentLamports,
      });

      const cronJobFunding = cronJobFundingLamports / LAMPORTS_PER_SOL;
      const pdaWalletFunding = pdaWalletFundingLamports / LAMPORTS_PER_SOL;
      const recipientFee = recipientFeeLamports / LAMPORTS_PER_SOL;
      const operationalSol = cronJobFunding + pdaWalletFunding;
      // recipientFeeLamports already represents only the ADDITIONAL recipient rent needed
      // (0 if already included in shortfall, full amount if not)
      const totalSolNeeded = rentFee + operationalSol + recipientFee;

      return {
        rentFee,
        cronJobFunding,
        pdaWalletFunding,
        recipientFee,
        operationalSol,
        totalSolNeeded,
        currentCronJobBalance: cronJobBalanceLamports.toString(),
        currentPdaWalletBalance: pdaWalletBalanceLamports.toString(),
      };
    },
  );
