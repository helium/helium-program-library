use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("Must boost for the minimum boosting duration")]
  BelowMinimumBoost,
  #[msg("No mobile oracle price")]
  NoOraclePrice,
  #[msg("Hex is already boosted the maximum amount of 256x")]
  MaxBoostExceeded,
  #[msg("Hexboost version has changed since this instruction was formed, transaction rejected for safety")]
  InvalidVersion,
  #[msg("Error from pyth")]
  PythError,
  #[msg("No pyth price found")]
  PythPriceNotFound,
  #[msg("Error in arithmetic")]
  ArithmeticError,
}
