use anchor_lang::prelude::*;

#[error_code]
pub enum DataCreditsErrors {
  // 6000
  #[msg("Bump couldn't be found")]
  BumpNotAvailable,

  #[msg("Error loading Pyth data")]
  PythError,

  #[msg("Pyth price is not available")]
  PythPriceNotFound,

  #[msg("Pyth price is stale")]
  PythPriceFeedStale,

  #[msg("Arithmetic error")]
  ArithmeticError,

  #[msg("Invalid arguments")]
  InvalidArgs,
}
