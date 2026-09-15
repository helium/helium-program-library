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

  #[msg("DCA destination must be the top off's HNT account")]
  InvalidDcaDestination,

  #[msg("Next task must be a free task the run was given")]
  InvalidFreeTask,

  #[msg("DCA interval seconds must be greater than zero")]
  InvalidDcaInterval,

  #[msg("DCA mint and DCA mint account must be passed together")]
  IncompleteDcaMintChange,

  #[msg("Changing the DCA mint requires the stored DCA account, holding nothing")]
  DcaMintAccountNotEmpty,
}
