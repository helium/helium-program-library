import {
  AccountInfo,
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {
  entityCronAuthorityKey,
  init as initHplCrons,
} from "@helium/hpl-crons-sdk";
import {
  cronJobKey,
  cronJobNameMappingKey,
  cronJobTransactionKey,
  init as initCron,
  PROGRAM_ID,
} from "@helium/cron-sdk";
import {
  init as initTuktuk,
  customSignerKey,
  nextAvailableTaskIds,
  taskKey,
} from "@helium/tuktuk-sdk";
import { getHotspotsByOwner } from "@/lib/queries/hotspots";
import { getNumRecipientsNeeded } from "@/lib/queries/hotspots";
import {
  calculateCronJobCostPerClaim,
  calculatePdaWalletCostPerClaim,
  ENTITY_CLAIM_CRON_NAME,
  RECIPIENT_RENT,
  ATA_RENT,
  TASK_RETURN_ACCOUNT_SIZE,
} from "@/lib/utils/automation-helpers";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { HNT_MINT } from "@helium/spl-utils";
import { TASK_QUEUE_ID } from "@/lib/constants/tuktuk";

/**
 * Return the cron-transaction indices in [0, nextTransactionId) whose on-chain
 * account still exists. nextTransactionId is a monotonic counter, so claims
 * removed individually leave holes; callers that remove or close every claim
 * must skip those holes or the remove instruction hits an uninitialized
 * account (AccountNotInitialized / 0xbc4).
 */
export async function liveCronTransactionIds(
  connection: Connection,
  cronJob: PublicKey,
  nextTransactionId: number
): Promise<number[]> {
  if (nextTransactionId <= 0) return [];
  const keys = Array.from(
    { length: nextTransactionId },
    (_, i) => cronJobTransactionKey(cronJob, i)[0]
  );
  // We only need existence, so fetch no account data. getMultipleAccountsInfo
  // caps at 100 keys per call, so chunk the list.
  const infos: (AccountInfo<Buffer> | null)[] = [];
  for (let i = 0; i < keys.length; i += 100) {
    infos.push(
      ...(await connection.getMultipleAccountsInfo(keys.slice(i, i + 100), {
        dataSlice: { offset: 0, length: 0 },
      }))
    );
  }
  return keys.map((_, i) => i).filter((i) => infos[i] != null);
}

/**
 * Build the instructions that tear down a wallet's entity-claim cron: remove
 * every live claim (skipping the holes individually-removed claims leave in the
 * monotonic nextTransactionId counter) then close the cron and its name
 * mapping. All freed rent is refunded to `rentRefund`.
 */
export async function buildTeardownInstructions(
  connection: Connection,
  hplCronsProgram: Awaited<ReturnType<typeof initHplCrons>>,
  cronJob: PublicKey,
  authority: PublicKey,
  rentRefund: PublicKey,
  nextTransactionId: number
): Promise<TransactionInstruction[]> {
  const liveTxIds = await liveCronTransactionIds(
    connection,
    cronJob,
    nextTransactionId
  );

  return [
    ...(await Promise.all(
      liveTxIds.map((txId) =>
        hplCronsProgram.methods
          .removeEntityFromCronV0({ index: txId })
          .accounts({
            cronJob,
            rentRefund,
            cronJobTransaction: cronJobTransactionKey(cronJob, txId)[0],
          })
          .instruction()
      )
    )),
    await hplCronsProgram.methods
      .closeEntityClaimCronV0()
      .accounts({
        cronJob,
        rentRefund,
        cronJobNameMapping: cronJobNameMappingKey(
          authority,
          ENTITY_CLAIM_CRON_NAME
        )[0],
      })
      .instruction(),
  ];
}

/**
 * Fetch the task queue fresh and return the key of the next free task slot.
 * Throws when the queue has no free slots.
 */
export async function nextFreeTaskKey(
  tuktukProgram: Awaited<ReturnType<typeof initTuktuk>>
): Promise<PublicKey> {
  const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(
    TASK_QUEUE_ID
  );
  const [taskId] = nextAvailableTaskIds(taskQueueAcc.taskBitmap, 1, false);
  if (taskId == null) {
    throw new Error("No available task IDs in task queue");
  }
  return taskKey(TASK_QUEUE_ID, taskId)[0];
}

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
  provider: anchor.AnchorProvider
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
  const cronJobAccount = await cronProgram.account.cronJobV0.fetchNullable(
    cronJob
  );

  // Fetch task queue for minCrankReward
  const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(
    TASK_QUEUE_ID
  );
  const minCrankReward = taskQueueAcc?.minCrankReward?.toNumber() || 10000;

  // Get current balances and calculate rent
  const cronJobSolanaAccount = await provider.connection.getAccountInfo(
    cronJob
  );
  const cronJobBalanceLamports = cronJobSolanaAccount?.lamports ?? 0;

  // Calculate minimum rent for cron job account based on its data length
  // If account doesn't exist, rent is 0
  const cronJobRentLamports = cronJobSolanaAccount
    ? await provider.connection.getMinimumBalanceForRentExemption(
        cronJobSolanaAccount.data.length
      )
    : 0;

  const pdaWalletBalanceLamports = await provider.connection.getBalance(
    pdaWallet
  );

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
    numCronTransactions
  );
  const pdaWalletCostPerClaimLamports = calculatePdaWalletCostPerClaim(
    totalHotspots || 1
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
    PROGRAM_ID
  );
  const taskReturnAccountInfo = await provider.connection.getAccountInfo(
    taskReturnAccount1
  );
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
