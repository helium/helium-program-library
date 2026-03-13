import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { entityCronAuthorityKey } from "@helium/hpl-crons-sdk";
import { cronJobKey, init as initCron, PROGRAM_ID } from "@helium/cron-sdk";
import { init as initTuktuk, customSignerKey } from "@helium/tuktuk-sdk";
import { getHotspotsByOwner } from "@/lib/queries/hotspots";
import { getNumRecipientsNeeded } from "@/lib/queries/hotspots";
import {
  calculateCronJobCostPerClaim,
  calculatePdaWalletCostPerClaim,
  RECIPIENT_RENT,
  ATA_RENT,
  TASK_RETURN_ACCOUNT_SIZE,
} from "@/lib/utils/automation-helpers";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { HNT_MINT } from "@helium/spl-utils";
import { TASK_QUEUE_ID } from "@/lib/constants/tuktuk";

export interface AutomationData {
  cronJobAccount: any | null; // cronJobV0 account (null if doesn't exist)
  cronJobBalanceLamports: number;
  cronJobRentLamports: number;
  pdaWalletBalanceLamports: number;
  totalHotspots: number;
  minCrankReward: number;
  cronJobCostPerClaimLamports: number;
  pdaWalletCostPerClaimLamports: number;
  recipientRentLamports: number;
  ataRentLamports: number; // ATA rent if ATA doesn't exist (will be locked up)
  taskReturnAccountRentLamports: number; // Task return account rent if it doesn't exist (will be locked up)
  cronJob: PublicKey;
  pdaWallet: PublicKey;
}

/**
 * Fetch all automation-related data needed for funding calculations.
 * This includes account balances, costs, and rent calculations.
 * Always returns a valid AutomationData object, even if cron job doesn't exist.
 * When cron job doesn't exist, cronJobAccount will be null and balances/rent will be 0.
 */
export async function fetchAutomationData(
  walletAddress: string,
  provider: anchor.AnchorProvider,
): Promise<AutomationData> {
  const wallet = new PublicKey(walletAddress);

  // Initialize programs
  const cronProgram = await initCron(provider);
  const tuktukProgram = await initTuktuk(provider);

  // Derive keys
  const authority = entityCronAuthorityKey(wallet)[0];
  const cronJob = cronJobKey(authority, 0)[0];
  const pdaWallet = customSignerKey(TASK_QUEUE_ID, [
    Buffer.from("claim_payer"),
    wallet.toBuffer(),
  ])[0];

  // Fetch cron job account
  const cronJobAccount =
    await cronProgram.account.cronJobV0.fetchNullable(cronJob);

  // Fetch task queue for minCrankReward
  const taskQueueAcc =
    await tuktukProgram.account.taskQueueV0.fetch(TASK_QUEUE_ID);
  const minCrankReward = taskQueueAcc?.minCrankReward?.toNumber() || 10000;

  // Get current balances and calculate rent
  const cronJobSolanaAccount =
    await provider.connection.getAccountInfo(cronJob);
  const cronJobBalanceLamports = cronJobSolanaAccount?.lamports ?? 0;

  // Calculate minimum rent for cron job account based on its data length
  // If account doesn't exist, rent is 0
  const cronJobRentLamports = cronJobSolanaAccount
    ? await provider.connection.getMinimumBalanceForRentExemption(
        cronJobSolanaAccount.data.length,
      )
    : 0;

  const pdaWalletBalanceLamports =
    await provider.connection.getBalance(pdaWallet);

  // Get hotspot count
  const hotspotsData = await getHotspotsByOwner({
    owner: walletAddress,
    page: 1,
    limit: 1,
  });
  const totalHotspots = hotspotsData.total;

  // Calculate cost per claim for each pool
  // If cron job doesn't exist, numCronTransactions is 0 (no transactions yet)
  const numCronTransactions = cronJobAccount?.nextTransactionId || 0;
  const cronJobCostPerClaimLamports = calculateCronJobCostPerClaim(
    minCrankReward,
    numCronTransactions,
  );
  const pdaWalletCostPerClaimLamports = calculatePdaWalletCostPerClaim(
    totalHotspots || 1,
  );

  // Calculate recipient rent that's already committed
  const hotspotsNeedingRecipient = await getNumRecipientsNeeded(walletAddress);
  const recipientRentLamports =
    hotspotsNeedingRecipient > 0
      ? hotspotsNeedingRecipient * RECIPIENT_RENT * LAMPORTS_PER_SOL
      : 0;

  // Check if ATA exists - if not, rent will be needed and locked up
  const ata = getAssociatedTokenAddressSync(HNT_MINT, wallet, true);
  const ataAccount = await provider.connection.getAccountInfo(ata);
  const ataRentLamports = ataAccount ? 0 : ATA_RENT;

  // Check if task return account exists
  // Task return accounts are derived from the cron job key
  // There are two task return accounts (task_return_account_1 and task_return_account_2)
  // We check the first one - if it doesn't exist, we need to account for rent
  const [taskReturnAccount1] = PublicKey.findProgramAddressSync(
    [Buffer.from("task_return_account_1"), cronJob.toBuffer()],
    PROGRAM_ID,
  );
  const taskReturnAccountInfo =
    await provider.connection.getAccountInfo(taskReturnAccount1);
  const taskReturnAccountRentLamports = taskReturnAccountInfo
    ? 0
    : Math.ceil(TASK_RETURN_ACCOUNT_SIZE * LAMPORTS_PER_SOL);

  return {
    cronJobAccount,
    cronJobBalanceLamports,
    cronJobRentLamports,
    pdaWalletBalanceLamports,
    totalHotspots,
    minCrankReward,
    cronJobCostPerClaimLamports,
    pdaWalletCostPerClaimLamports,
    recipientRentLamports,
    ataRentLamports,
    taskReturnAccountRentLamports,
    cronJob,
    pdaWallet,
  };
}
