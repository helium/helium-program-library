use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("Must boost for the minimum boosting duration")]
  BelowMinimumBoost
}