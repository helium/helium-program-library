export const TASK_RETURN_ACCOUNT_FUNDING_LAMPORTS = 10_000_000;

/**
 * What the wallet pays for the entity-claim cron job: the SOL transferred to
 * it for `duration` runs, and the setup rent init_entity_claim_cron_v0 takes.
 */
export const cronJobFunding = ({
  recreatesCronJob,
  duration,
  minCrankRewardLamports,
  existingCronJobLamports,
  baseAutomationRentLamports,
  existingCronJobRentLamports,
  numCronTransactions,
  taskReturnAccountFundingLamports,
}: {
  // True when init creates the cron job, including the re-init after a
  // schedule change tears the old one down.
  recreatesCronJob: boolean;
  duration: number;
  minCrankRewardLamports: number;
  existingCronJobLamports: number;
  baseAutomationRentLamports: number;
  existingCronJobRentLamports: number;
  numCronTransactions: number;
  // Reserved from a cron job that stays: 0 only when `task_return_account_1`
  // is owned by the cron program (init leaves it system-owned; the first run
  // assigns and resizes it).
  taskReturnAccountFundingLamports: number;
}) => {
  // A cron job init creates starts with only its rent; the 0.01 SOL
  // task-return funding is sent again, whatever an old cron job the teardown
  // refunds held.
  const crankSolFee = Math.max(
    0,
    duration * (1 + numCronTransactions) * minCrankRewardLamports -
      (recreatesCronJob
        ? 0
        : Math.max(
            0,
            existingCronJobLamports -
              existingCronJobRentLamports -
              taskReturnAccountFundingLamports,
          )),
  );
  return {
    crankSolFee,
    transferLamports:
      crankSolFee > 0
        ? crankSolFee +
          (recreatesCronJob ? TASK_RETURN_ACCOUNT_FUNDING_LAMPORTS : 0)
        : 0,
    rentFeeLamports: recreatesCronJob
      ? baseAutomationRentLamports +
        minCrankRewardLamports +
        TASK_RETURN_ACCOUNT_FUNDING_LAMPORTS
      : 0,
  };
};
