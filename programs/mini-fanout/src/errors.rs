use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("Error in arithmetic")]
  ArithmeticError,
  #[msg("Invalid data increase")]
  InvalidDataIncrease,
  #[msg("Rewards not claimed")]
  RewardsNotClaimed,
  #[msg("Invalid schedule")]
  InvalidSchedule,
  #[msg("Invalid shares")]
  InvalidShares,
  #[msg("Task not due yet. Fanout can only distribute once per schedule.")]
  TaskNotDue,
}
