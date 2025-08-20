use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("Task not due")]
  TaskNotDue,

  #[msg("Invalid schedule")]
  InvalidSchedule,
}
