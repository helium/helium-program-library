use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("Must boost for the minimum boosting duration")]
  BelowMinimumBoost,
  #[msg("No mobile oracle price")]
  NoOraclePrice,
  #[msg("Hex is already boosted the maximum amount of 256x")]
  MaxBoostExceeded,
}
