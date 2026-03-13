import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export type Schedule = "daily" | "weekly" | "monthly";

// Constants from useAutomateHotspotClaims hook
export const BASE_AUTOMATION_RENT = 0.02098095;
export const TASK_RETURN_ACCOUNT_SIZE = 0.01;
export const MIN_RENT = 0.00089088;
export const EST_TX_FEE = 0.000001;
export const RECIPIENT_RENT = 0.00242208;
export const ATA_RENT = 0.002039 * LAMPORTS_PER_SOL;

// Minimum rent requirements in lamports (for calculating available balances)
export const PDA_WALLET_RENT_LAMPORTS = Math.ceil(MIN_RENT * LAMPORTS_PER_SOL);

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
  ataRentLamports?: number; // ATA rent if ATA doesn't exist (will be locked up)
  taskReturnAccountRentLamports?: number; // Task return account rent if it doesn't exist (will be locked up)
}

/**
 * Calculate how many periods the funding will last based on schedule and current balances.
 * Returns the period length and number of periods remaining for each pool, plus the minimum.
 *
 * Accounts for minimum rent requirements:
 * - Cron job: rent for the account with its data (BASE_AUTOMATION_RENT)
 * - PDA wallet: minimum rent for account with 0 data (MIN_RENT)
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
    ataRentLamports = 0,
    taskReturnAccountRentLamports = 0,
  } = params;

  // Subtract minimum rent, task return account rent, and recipient rent from balances since they're already committed
  // Cron job must maintain rent for the account and task return account
  const availableCronJobBalance = Math.max(
    0,
    cronJobBalanceLamports -
      cronJobRentLamports -
      taskReturnAccountRentLamports,
  );

  // PDA wallet must maintain minimum rent, plus any recipient rent and ATA rent
  const availablePdaWalletBalance = Math.max(
    0,
    pdaWalletBalanceLamports -
      PDA_WALLET_RENT_LAMPORTS -
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
  additionalDuration: number;
  ataRentLamports?: number; // ATA rent if ATA doesn't exist (will be locked up)
  taskReturnAccountRentLamports?: number; // Task return account rent if it doesn't exist (will be locked up)
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
  recipientFeeLamports: number; // Recipient fee to show separately (0 if already included in shortfall)
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
    additionalDuration,
    ataRentLamports = 0,
    taskReturnAccountRentLamports = 0,
  } = params;

  // Calculate available balances (subtract rent that's already committed)
  // Task return account rent is part of cron job funding, so subtract it from cron job balance
  // If balance goes negative, that's a shortfall that needs to be funded
  const cronJobBalanceAfterRent =
    cronJobBalanceLamports -
    cronJobRentLamports -
    taskReturnAccountRentLamports;
  const cronJobRentShortfall = Math.max(0, -cronJobBalanceAfterRent);
  const availableCronJobBalanceLamports = Math.max(0, cronJobBalanceAfterRent);

  const pdaWalletBalanceAfterRent =
    pdaWalletBalanceLamports -
    PDA_WALLET_RENT_LAMPORTS -
    recipientRentLamports -
    ataRentLamports;
  const pdaWalletRentShortfall = Math.max(0, -pdaWalletBalanceAfterRent);
  const availablePdaWalletBalanceLamports = Math.max(
    0,
    pdaWalletBalanceAfterRent,
  );

  // Calculate how much of the shortfall covers recipient rent
  // The shortfall covers rent in order: PDA wallet rent, then recipient rent, then ATA rent
  // Calculate PDA wallet rent shortfall (how much shortfall is just for PDA wallet rent)
  const pdaWalletBalanceAfterPdaRentOnly =
    pdaWalletBalanceLamports - PDA_WALLET_RENT_LAMPORTS;
  const pdaWalletRentShortfallOnly = Math.max(
    0,
    -pdaWalletBalanceAfterPdaRentOnly,
  );
  // The remaining shortfall (after covering PDA wallet rent) goes to recipient rent and ATA rent
  // Recipient rent covered = min(remaining shortfall, recipientRentLamports)
  const shortfallAfterPdaRent = Math.max(
    0,
    pdaWalletRentShortfall - pdaWalletRentShortfallOnly,
  );
  const recipientRentCoveredByShortfall = Math.min(
    shortfallAfterPdaRent,
    recipientRentLamports,
  );

  // If there's no shortfall, the balance covers all rent including recipient rent,
  // which means recipients are already funded, so no additional recipient rent needed
  const recipientRentAlreadyFunded = pdaWalletRentShortfall === 0;

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
  // cron job rent, task return account rent for cron job)
  // So we just add the shortfall - no need to add rent separately
  const cronJobFundingWithShortfall =
    fundingNeeded.cronJobFundingLamports + cronJobRentShortfall;
  const pdaWalletFundingWithShortfall =
    fundingNeeded.pdaWalletFundingLamports + pdaWalletRentShortfall;

  // However, if there's no shortfall (balance already covers rent), we still need to add
  // ATA rent and task return account rent if they don't exist yet (one-time creation costs)
  const pdaWalletFundingWithAta =
    pdaWalletFundingWithShortfall +
    (pdaWalletRentShortfall === 0 && ataRentLamports > 0 ? ataRentLamports : 0);

  const cronJobFundingWithTaskReturn =
    cronJobFundingWithShortfall +
    (cronJobRentShortfall === 0 && taskReturnAccountRentLamports > 0
      ? taskReturnAccountRentLamports
      : 0);

  // Recipient fee: return only the ADDITIONAL recipient rent that still needs to be paid.
  // - If there's no shortfall: balance covers all rent, so recipients are already funded (fee = 0)
  // - If there's a shortfall: calculate how much recipient rent is covered by shortfall,
  //   and return the remaining amount that still needs to be paid
  const recipientFeeLamports = recipientRentAlreadyFunded
    ? 0
    : Math.max(0, recipientRentLamports - recipientRentCoveredByShortfall);

  return {
    cronJobFundingLamports: cronJobFundingWithTaskReturn,
    pdaWalletFundingLamports: pdaWalletFundingWithAta,
    recipientFeeLamports,
    currentMinPeriods,
    targetPeriods,
  };
}
