use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("Task already exists")]
  TaskAlreadyExists,
  #[msg("Cron job not removed from queue")]
  CronJobNotRemovedFromQueue,
}
