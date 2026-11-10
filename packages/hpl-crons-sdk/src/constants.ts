import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "hcrLPFgFUY6sCUKzqLWxXx5bntDiDCrAZVcrXfx9AHu"
);

export const TASK_QUEUE_ID = new PublicKey(
  "H39gEszvsi6AT4rYBiJTuZHJSF5hMHy6CKGTd7wzhsg7"
);

/**
 * Oracle URL hpl-crons compiles in per cluster and writes into the claims it
 * adds (utils/shared-utils/src/lib.rs ORACLE_URL).
 */
export const HNT_REWARDS_ORACLE_URL = "https://hnt-rewards.oracle.helium.io";
export const HNT_REWARDS_ORACLE_URL_DEVNET =
  "https://hnt-rewards.oracle.test-helium.com";

// Byte sizes of the accounts hpl-crons instructions create. Price them with
// connection.getMinimumBalanceForRentExemption (batch with Promise.all)
// rather than hardcoding lamports, so fees follow the cluster's Rent sysvar.

/**
 * Space `init_delegation_claim_bot_v0` allocates for a DelegationClaimBotV0:
 * `8 + 60 + DelegationClaimBotV0::INIT_SPACE` (see
 * programs/hpl-crons/src/instructions/init_delegation_claim_bot_v0.rs; the
 * struct in programs/hpl-crons/src/state.rs is 138 bytes). The IDL-derived
 * `.size` Anchor reports is 8 + 138 — it omits the 60-byte header the program
 * reserves, so pricing rent off it under-quotes the wallet by 60 bytes.
 */
export const DELEGATION_CLAIM_BOT_SPACE = 8 + 60 + 138;

/**
 * Cron-job name-mapping alias. hpl_crons hardcodes this in
 * init_entity_claim_cron_v0, and the name-mapping PDA is keyed by
 * (authority, name) — so a wallet has exactly one entity-claim cron. close and
 * requeue must pass this same name mapping.
 */
export const ENTITY_CLAIM_CRON_NAME = "entity_claim";

/**
 * Byte sizes of the accounts init_entity_claim_cron_v0 creates through the
 * tuktuk cron program's initialize_cron_job_v0 (tuktuk
 * solana-programs/programs/cron/src/instructions/initialize_cron_job_v0.rs).
 * `space = 8 + 60 + size_of::<T>() + name.len() [+ schedule.len()]`, with the
 * name fixed to ENTITY_CLAIM_CRON_NAME. size_of values reflect the deployed
 * program's structs (CronJobV0 carries a `next_schedule_task: Pubkey` the
 * IDL shows). Verified against mainnet: UserCronJobsV0 112 bytes,
 * CronJobV0 301 bytes with a 13-char schedule, CronJobNameMappingV0 144 bytes.
 */
export const USER_CRON_JOBS_SPACE = 8 + 60 + 44;
export const CRON_JOB_NAME_MAPPING_SPACE =
  8 + 60 + 64 + ENTITY_CLAIM_CRON_NAME.length;
export const cronJobSpace = (scheduleLen: number) =>
  8 + 60 + 208 + ENTITY_CLAIM_CRON_NAME.length + scheduleLen;
/**
 * initialize_cron_job_v0 funds task_return_account_1 with
 * `Rent::minimum_balance(1024)` and queues the "queue entity_claim" schedule
 * task. tuktuk sizes a TaskV0 by its compiled transaction, and the one init
 * compiles is 800 bytes (measured on a mainnet fork by the blockchain-api
 * automation e2e). Do not measure this from a live cron job: once the job
 * has run, queue_cron_tasks requeues the schedule task at 738 bytes, paid
 * from the cron's own funding rather than by the wallet. The init task's
 * rent is refunded when it runs.
 */
export const TASK_RETURN_ACCOUNT_FUNDING_SPACE = 1024;
export const ENTITY_CLAIM_SCHEDULE_TASK_SPACE = 800;
/**
 * Longest six-column crontab the daily/weekly/monthly presets produce:
 * "SS MM HH DD * *". Used to size the cron job before a schedule is chosen.
 */
export const MAX_PRESET_SCHEDULE_LEN = 15;

/** The cron program queues up to 5 transactions per queue call. */
export const CRON_TRANSACTIONS_PER_QUEUE_CALL = 5;

/** Byte sizes of the accounts init_entity_claim_cron_v0 creates and funds. */
export const entityClaimCronSpaces = (
  scheduleLen: number = MAX_PRESET_SCHEDULE_LEN
) => [
  USER_CRON_JOBS_SPACE,
  cronJobSpace(scheduleLen),
  CRON_JOB_NAME_MAPPING_SPACE,
  TASK_RETURN_ACCOUNT_FUNDING_SPACE,
  ENTITY_CLAIM_SCHEDULE_TASK_SPACE,
];

/**
 * Space of a cron transaction that holds a remote source, such as the claim
 * add_wallet_to_entity_cron_v0 and add_entity_to_cron_v0 add. The cron
 * program's resize_to_fit sizes it to its serialized length plus a 64-byte
 * pad: discriminator, id, cron job, variant, url, signer, bump, pad. The payer
 * pays rent for this size.
 */
export const remoteCronTransactionSpace = (url: string) =>
  8 + 4 + 32 + 1 + 4 + Buffer.byteLength(url) + 32 + 1 + 64;
