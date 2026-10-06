import {
  entityClaimCronSpaces,
  ENTITY_CLAIM_CRON_NAME,
  MAX_PRESET_SCHEDULE_LEN,
} from "@helium/hpl-crons-sdk";
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getRentLamports } from "./balance-validation";

export type Schedule = "daily" | "weekly" | "monthly";

// Sizes and the cron name live in @helium/hpl-crons-sdk so the hooks and
// this service price the same accounts.
export { ENTITY_CLAIM_CRON_NAME };

// Constants from useAutomateHotspotClaims hook
export const TASK_RETURN_ACCOUNT_FUNDING_SOL = 0.01;
export const EST_TX_FEE = 0.000001;

/**
 * Lamports locked up when an entity-claim cron job is first created: rent for
 * the three cron accounts, the task-return-account funding and the schedule
 * task.
 */
export async function getBaseAutomationRentLamports(
  connection: Connection,
  scheduleLen: number = MAX_PRESET_SCHEDULE_LEN,
): Promise<number> {
  const rents = await Promise.all(
    entityClaimCronSpaces(scheduleLen).map((space) =>
      getRentLamports(connection, space),
    ),
  );
  return rents.reduce((sum, rent) => sum + rent, 0);
}

/**
 * Convert a schedule type to a cron string.
 * Gets current time and adds 1 minute, then converts to UTC.
 */
export function getScheduleCronString(schedule: Schedule): string {
  // Get current time and add 1 minute
  const now = new Date();
  now.setMinutes(now.getMinutes() + 1);

  // Convert to UTC
  const utcSeconds = now.getUTCSeconds();
  const utcMinutes = now.getUTCMinutes();
  const utcHours = now.getUTCHours();
  const utcDayOfMonth = now.getUTCDate();
  const utcDayOfWeek = now.getUTCDay();

  switch (schedule) {
    case "daily":
      // Run at the same hour and minute every day in UTC
      return `${utcSeconds} ${utcMinutes} ${utcHours} * * *`;
    case "weekly":
      // Run at the same hour and minute on the same day of week in UTC
      return `${utcSeconds} ${utcMinutes} ${utcHours} * * ${utcDayOfWeek + 1}`;
    case "monthly":
      // Run at the same hour and minute on the same day of month in UTC
      return `${utcSeconds} ${utcMinutes} ${utcHours} ${utcDayOfMonth} * *`;
    default:
      return `${utcSeconds} ${utcMinutes} ${utcHours} * * *`;
  }
}

const SCHEDULE_PRESETS: readonly Schedule[] = ["daily", "weekly", "monthly"];

/**
 * Resolve a setup input into a raw crontab string. The preset cadences
 * (daily/weekly/monthly) map through getScheduleCronString; any other value is
 * treated as an already-raw clockwork crontab and returned unchanged. Lets
 * callers pass either a convenient preset or a full crontab.
 */
export function resolveScheduleToCron(scheduleOrCron: string): string {
  return (SCHEDULE_PRESETS as readonly string[]).includes(scheduleOrCron)
    ? getScheduleCronString(scheduleOrCron as Schedule)
    : scheduleOrCron;
}

const PRESET_SHAPE: Record<Schedule, RegExp> = {
  daily: /^\d+ \d+ \d+ \* \* \*$/,
  weekly: /^\d+ \d+ \d+ \* \* \d+$/,
  monthly: /^\d+ \d+ \d+ \d+ \* \*$/,
};
export const scheduleChanged = (stored: string, input: string): boolean =>
  (SCHEDULE_PRESETS as readonly string[]).includes(input)
    ? !PRESET_SHAPE[input as Schedule].test(stored)
    : stored !== input;

/**
 * Longest crontab a setup input can resolve to. Presets resolve from the clock
 * without padding, so createAutomation can resolve a longer one than an
 * earlier estimate did; pricing at the bound keeps the estimate from falling
 * short.
 */
export const maxScheduleCronLength = (schedule: string): number => {
  switch (schedule) {
    case "daily":
    case "weekly":
      return 14;
    case "monthly":
      return 15;
    default:
      return schedule.length;
  }
};

export interface CronScheduleInfo {
  schedule: Schedule;
  time: string;
  nextRun: Date;
}

/**
 * Interpret a cron string and extract schedule information.
 */
export function interpretCronString(cronString: string): CronScheduleInfo {
  const [seconds, minutes, hours, dayOfMonth, month, dayOfWeek] =
    cronString.split(" ");

  // Create a UTC date object for the next run time
  const now = new Date();
  const nextRunUTC = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      parseInt(hours, 10),
      parseInt(minutes, 10),
      parseInt(seconds, 10),
    ),
  );

  // Convert UTC to local time for display
  const nextRun = new Date(nextRunUTC);

  // Format time as HH:MM AM/PM in local time
  const timeStr = nextRun.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  // Determine schedule type
  let schedule: Schedule;
  if (dayOfMonth !== "*" && month === "*") {
    schedule = "monthly";
    // If the day has already passed this month, move to next month
    if (now.getUTCDate() > parseInt(dayOfMonth, 10)) {
      nextRunUTC.setUTCMonth(nextRunUTC.getUTCMonth() + 1);
    }
    nextRunUTC.setUTCDate(parseInt(dayOfMonth, 10));
    nextRun.setTime(nextRunUTC.getTime());
  } else if (dayOfWeek !== "*") {
    schedule = "weekly";
    // Calculate days until next occurrence
    const currentDay = now.getUTCDay();
    const targetDay = parseInt(dayOfWeek, 10);
    const daysUntil = targetDay - currentDay;
    nextRunUTC.setUTCDate(
      now.getUTCDate() + (daysUntil >= 0 ? daysUntil : 7 + daysUntil),
    );
    nextRun.setTime(nextRunUTC.getTime());
  } else {
    schedule = "daily";
    // If time has already passed today in UTC, move to tomorrow
    if (now > nextRun) {
      nextRunUTC.setUTCDate(nextRunUTC.getUTCDate() + 1);
      nextRun.setTime(nextRunUTC.getTime());
    }
  }

  return {
    schedule,
    time: timeStr,
    nextRun,
  };
}

/**
 * Calculate cost per claim for cron job pool.
 * Each cron job triggering uses (1 + numCronTransactions) * minCrankReward.
 */
export function calculateCronJobCostPerClaim(
  minCrankReward: number,
  numCronTransactions: number,
): number {
  return (1 + numCronTransactions) * minCrankReward;
}

/**
 * Calculate cost per claim for PDA wallet pool.
 * PDA wallet needs to fund:
 * - Wallet claim tasks: Math.ceil(totalHotspots / 5) * 20000 (one task per 5 hotspots, each costs 20k)
 * - Hotspot claims: totalHotspots * 20000 (each hotspot claim costs 20k)
 */
export function calculatePdaWalletCostPerClaim(totalHotspots: number): number {
  return Math.ceil(totalHotspots / 5) * 20000 + totalHotspots * 20000;
}

/**
 * Calculate how many periods a pool can support given its balance and cost per claim.
 */
export function calculatePoolPeriods(
  balanceLamports: number,
  costPerClaimLamports: number,
): number {
  return Math.max(0, Math.floor(balanceLamports / costPerClaimLamports));
}

export interface CalculatePeriodsRemainingParams {
  schedule: Schedule;
  cronJobBalanceLamports: number;
  cronJobCostPerClaimLamports: number;
  pdaWalletBalanceLamports: number;
  pdaWalletCostPerClaimLamports: number;
  recipientRentLamports?: number;
  cronJobRentLamports: number; // Minimum rent for cron job account (calculated from account data length)
  pdaWalletRentLamports: number; // Minimum rent for the 0-data PDA wallet, priced from the cluster
  ataRentLamports?: number; // ATA rent if ATA doesn't exist (will be locked up)
  taskReturnAccountFundingLamports?: number; // Fixed 0.01 SOL the cron job is topped up with for its task return accounts on first funding; not rent
}

/**
 * Calculate how many periods the funding will last based on schedule and current balances.
 * Returns the period length and number of periods remaining for each pool, plus the minimum.
 *
 * Accounts for minimum rent requirements:
 * - Cron job: rent for the account with its data (cronJobRentLamports)
 * - PDA wallet: minimum rent for account with 0 data (pdaWalletRentLamports)
 * - Recipient rent: already committed rent for recipients
 */
export function calculatePeriodsRemaining(
  params: CalculatePeriodsRemainingParams,
): {
  periodLength: Schedule;
  periodsRemaining: number; // Minimum of both pools
  cronJobPeriodsRemaining: number;
  pdaWalletPeriodsRemaining: number;
} {
  const {
    schedule,
    cronJobBalanceLamports,
    cronJobCostPerClaimLamports,
    pdaWalletBalanceLamports,
    pdaWalletCostPerClaimLamports,
    recipientRentLamports = 0,
    cronJobRentLamports,
    pdaWalletRentLamports,
    ataRentLamports = 0,
    taskReturnAccountFundingLamports = 0,
  } = params;

  // Subtract minimum rent, task return account funding, and recipient rent from balances since they're already committed
  // Cron job must maintain rent for the account and task return account
  const availableCronJobBalance = Math.max(
    0,
    cronJobBalanceLamports -
      cronJobRentLamports -
      taskReturnAccountFundingLamports,
  );

  // PDA wallet must maintain minimum rent, plus any recipient rent and ATA rent
  const availablePdaWalletBalance = Math.max(
    0,
    pdaWalletBalanceLamports -
      pdaWalletRentLamports -
      recipientRentLamports -
      ataRentLamports,
  );

  // Calculate periods remaining for each pool independently
  const cronJobPeriodsRemaining = calculatePoolPeriods(
    availableCronJobBalance,
    cronJobCostPerClaimLamports,
  );
  const pdaWalletPeriodsRemaining = calculatePoolPeriods(
    availablePdaWalletBalance,
    pdaWalletCostPerClaimLamports,
  );

  // The effective periods remaining is the minimum of both pools
  // since both are required for each claim
  const periodsRemaining = Math.min(
    cronJobPeriodsRemaining,
    pdaWalletPeriodsRemaining,
  );

  return {
    periodLength: schedule,
    periodsRemaining,
    cronJobPeriodsRemaining,
    pdaWalletPeriodsRemaining,
  };
}

export interface CalculateFundingNeededParams {
  availableCronJobBalanceLamports: number;
  cronJobCostPerClaimLamports: number;
  availablePdaWalletBalanceLamports: number;
  pdaWalletCostPerClaimLamports: number;
  targetPeriods: number;
}

/**
 * Calculate funding needed for both pools to reach target periods.
 * First equalizes pools if needed, then funds both equally to target.
 * Returns funding needed in lamports for each pool.
 */
export function calculateFundingNeededForTargetPeriods(
  params: CalculateFundingNeededParams,
): {
  cronJobFundingLamports: number;
  pdaWalletFundingLamports: number;
} {
  const {
    availableCronJobBalanceLamports,
    cronJobCostPerClaimLamports,
    availablePdaWalletBalanceLamports,
    pdaWalletCostPerClaimLamports,
    targetPeriods,
  } = params;

  const cronJobPeriods = calculatePoolPeriods(
    availableCronJobBalanceLamports,
    cronJobCostPerClaimLamports,
  );
  const pdaWalletPeriods = calculatePoolPeriods(
    availablePdaWalletBalanceLamports,
    pdaWalletCostPerClaimLamports,
  );

  // Calculate funding needed for each pool independently to reach target periods
  const cronJobPeriodsNeeded = Math.max(0, targetPeriods - cronJobPeriods);
  const pdaWalletPeriodsNeeded = Math.max(0, targetPeriods - pdaWalletPeriods);

  const cronJobFundingLamports =
    cronJobPeriodsNeeded * cronJobCostPerClaimLamports;
  const pdaWalletFundingLamports =
    pdaWalletPeriodsNeeded * pdaWalletCostPerClaimLamports;

  return {
    cronJobFundingLamports,
    pdaWalletFundingLamports,
  };
}

export interface CalculateFundingForAdditionalDurationParams {
  cronJobBalanceLamports: number;
  cronJobCostPerClaimLamports: number;
  pdaWalletBalanceLamports: number;
  pdaWalletCostPerClaimLamports: number;
  recipientRentLamports: number;
  cronJobRentLamports: number;
  pdaWalletRentLamports: number; // Minimum rent for the 0-data PDA wallet, priced from the cluster
  additionalDuration: number;
  ataRentLamports?: number; // ATA rent if ATA doesn't exist (will be locked up)
  taskReturnAccountFundingLamports?: number; // Fixed 0.01 SOL the cron job is topped up with for its task return accounts on first funding; not rent
}

/**
 * Calculate funding needed to add additional duration to automation.
 * Handles all the logic for calculating available balances, current periods, and target periods.
 */
export function calculateFundingForAdditionalDuration(
  params: CalculateFundingForAdditionalDurationParams,
): {
  cronJobFundingLamports: number;
  pdaWalletFundingLamports: number;
  recipientFeeLamports: number; // Always 0; kept for the client schema's recipientFee
  currentMinPeriods: number;
  targetPeriods: number;
} {
  const {
    cronJobBalanceLamports,
    cronJobCostPerClaimLamports,
    pdaWalletBalanceLamports,
    pdaWalletCostPerClaimLamports,
    recipientRentLamports,
    cronJobRentLamports,
    pdaWalletRentLamports,
    additionalDuration,
    ataRentLamports = 0,
    taskReturnAccountFundingLamports = 0,
  } = params;

  // Calculate available balances (subtract rent that's already committed)
  // Task return account funding is part of cron job funding, so subtract it from cron job balance
  // If balance goes negative, that's a shortfall that needs to be funded
  const cronJobBalanceAfterRent =
    cronJobBalanceLamports -
    cronJobRentLamports -
    taskReturnAccountFundingLamports;
  const cronJobRentShortfall = Math.max(0, -cronJobBalanceAfterRent);
  const availableCronJobBalanceLamports = Math.max(0, cronJobBalanceAfterRent);

  const pdaWalletBalanceAfterRent =
    pdaWalletBalanceLamports -
    pdaWalletRentLamports -
    recipientRentLamports -
    ataRentLamports;
  const pdaWalletRentShortfall = Math.max(0, -pdaWalletBalanceAfterRent);
  const availablePdaWalletBalanceLamports = Math.max(
    0,
    pdaWalletBalanceAfterRent,
  );

  // Calculate current periods for each pool
  const cronJobPeriods = calculatePoolPeriods(
    availableCronJobBalanceLamports,
    cronJobCostPerClaimLamports,
  );
  const pdaWalletPeriods = calculatePoolPeriods(
    availablePdaWalletBalanceLamports,
    pdaWalletCostPerClaimLamports,
  );
  const currentMinPeriods = Math.min(cronJobPeriods, pdaWalletPeriods);

  // Target periods after funding
  const targetPeriods = currentMinPeriods + additionalDuration;

  // Calculate funding needed for periods
  const fundingNeeded = calculateFundingNeededForTargetPeriods({
    availableCronJobBalanceLamports,
    cronJobCostPerClaimLamports,
    availablePdaWalletBalanceLamports,
    pdaWalletCostPerClaimLamports,
    targetPeriods,
  });

  // Add rent shortfalls (when balance doesn't cover required rent)
  // The shortfall already includes all rent (PDA wallet rent, recipient rent, ATA rent for PDA wallet;
  // cron job rent, task return account funding for cron job)
  // So we just add the shortfall - no need to add rent separately
  const cronJobFundingWithShortfall =
    fundingNeeded.cronJobFundingLamports + cronJobRentShortfall;
  const pdaWalletFundingWithShortfall =
    fundingNeeded.pdaWalletFundingLamports + pdaWalletRentShortfall;

  return {
    cronJobFundingLamports: cronJobFundingWithShortfall,
    pdaWalletFundingLamports: pdaWalletFundingWithShortfall,
    // The PDA wallet shortfall above already holds all of the recipient rent
    // whenever the balance does not cover it, so none is charged on top.
    recipientFeeLamports: 0,
    currentMinPeriods,
    targetPeriods,
  };
}

export interface EstimateAutomationFundingParams extends CalculateFundingForAdditionalDurationParams {
  cronJobExists: boolean; // False when init_entity_claim_cron_v0 creates the cron job the funding lands in, including the re-init after a schedule change tears the old one down
  baseAutomationRentLamports: number; // Rent init_entity_claim_cron_v0 locks up; only charged when the cron job does not exist yet
  minCrankRewardLamports: number; // Task queue min_crank_reward init's queue_task_v0 moves from the wallet to the schedule task; only charged when the cron job does not exist yet
}

/**
 * Price the SOL a wallet needs to add `additionalDuration` to its automation,
 * including the initial setup rent when the cron job does not exist yet.
 */
export const estimateAutomationFunding = (
  params: EstimateAutomationFundingParams,
): {
  rentFeeLamports: number;
  cronJobFundingLamports: number;
  pdaWalletFundingLamports: number;
  recipientFeeLamports: number;
  operationalLamports: number;
  totalLamports: number;
} => {
  const { cronJobExists, baseAutomationRentLamports, minCrankRewardLamports } =
    params;

  // The task-return funding is left out: the cron job transfer below already
  // carries it.
  const rentFeeLamports = cronJobExists
    ? 0
    : baseAutomationRentLamports + minCrankRewardLamports;

  const {
    cronJobFundingLamports,
    pdaWalletFundingLamports,
    recipientFeeLamports,
  } = calculateFundingForAdditionalDuration(
    cronJobExists
      ? params
      : {
          // A cron job init is about to create starts with only its rent and
          // no task-return accounts, whatever an old cron job a teardown
          // refunds held. It is priced at the old cron job's claim count.
          ...params,
          cronJobBalanceLamports: 0,
          cronJobRentLamports: 0,
          taskReturnAccountFundingLamports: Math.ceil(
            TASK_RETURN_ACCOUNT_FUNDING_SOL * LAMPORTS_PER_SOL,
          ),
        },
  );

  const operationalLamports = cronJobFundingLamports + pdaWalletFundingLamports;
  // recipientFeeLamports is 0: pdaWalletFundingLamports already carries the
  // recipient rent.
  const totalLamports =
    rentFeeLamports + operationalLamports + recipientFeeLamports;

  return {
    rentFeeLamports,
    cronJobFundingLamports,
    pdaWalletFundingLamports,
    recipientFeeLamports,
    operationalLamports,
    totalLamports,
  };
};
