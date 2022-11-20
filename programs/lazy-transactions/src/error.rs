use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("The data did not match the root verification")]
  InvalidData,

  #[msg("Failed to serialize instruction")]
  InstructionSerializeFailed,
}
