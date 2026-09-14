use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("Task not due")]
  TaskNotDue,

  #[msg("Invalid schedule")]
  InvalidSchedule,

  #[msg("Invalid CPI context")]
  InvalidCpiContext,

  #[msg("Arithmetic error")]
  ArithmeticError,

  #[msg("Pyth price not found")]
  PythPriceNotFound,

  #[msg("Remote task signer must be the pinned DCA signer")]
  InvalidDcaSigner,

  #[msg("Remote task url must address the pinned DCA service")]
  InvalidDcaUrl,
}
