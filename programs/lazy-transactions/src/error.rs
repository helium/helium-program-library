use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("The data did not match the root verification")]
  InvalidData,

  #[msg("Failed to serialize instruction")]
  InstructionSerializeFailed,

  #[msg("Failed to serialize ToCreate")]
  ToCreateSerializeFailed,

  #[msg("Invalid canopy length")]
  CanopyLengthMismatch,

  #[msg("Transaction has already been executed")]
  TransactionAlreadyExecuted,
}
