use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("Treasury management is currently frozen")]
  Frozen,

  #[msg("Error in arithmetic")]
  ArithmeticError,
}
