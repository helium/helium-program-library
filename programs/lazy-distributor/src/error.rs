use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("The realloc increase was too large")]
  InvalidDataIncrease,

  #[msg("Error in arithmetic")]
  ArithmeticError,

  #[msg("Not enough oracles have reported the amount")]
  NotEnoughOracles,
  
  #[msg("Provided asset was invalid")]
  InvalidAsset,
}
