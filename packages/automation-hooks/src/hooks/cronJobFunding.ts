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
}: {
  // True when init creates the cron job, including the re-init after a
  // schedule change tears the old one down.
  recreatesCronJob: boolean;
  duration: number;
  minCrankRewardLamports: number;
  existingCronJobLamports: number;
  baseAutomationRentLamports: number;
}) => {
  // A cron job init creates starts with only its rent and no task-return
  // accounts, whatever an old cron job the teardown refunds held.
  const crankSolFee =
    duration * minCrankRewardLamports -
    (recreatesCronJob ? 0 : existingCronJobLamports);
  return {
    crankSolFee,
    transferLamports:
      crankSolFee > 0
        ? crankSolFee +
          (recreatesCronJob ? TASK_RETURN_ACCOUNT_FUNDING_LAMPORTS : 0)
        : 0,
    rentFeeLamports: recreatesCronJob
      ? baseAutomationRentLamports + TASK_RETURN_ACCOUNT_FUNDING_LAMPORTS
      : 0,
  };
};
