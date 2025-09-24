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
  #[msg("Invalid wallet")]
  InvalidWallet,
  #[msg("Invalid index")]
  InvalidIndex,
  #[msg("Invalid token account owner")]
  InvalidOwner,
  #[msg("Pre task not run")]
  PreTaskNotRun,
  #[msg("Invalid CPI context - must be called via tuktuk for next_task")]
  InvalidCpiContext,
}
