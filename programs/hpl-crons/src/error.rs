use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("Task already exists")]
  TaskAlreadyExists,
  #[msg("Cron job not removed from queue")]
  CronJobNotRemovedFromQueue,
  #[msg("Proposal is not in voting state")]
  NotVoting,
  #[msg("Must claim IOT/MOBILE delegation rewards before enabling automation")]
  UnclaimedIotMobileRewards,
}
