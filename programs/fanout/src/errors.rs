use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("Error in arithmetic")]
  ArithmeticError,
}
