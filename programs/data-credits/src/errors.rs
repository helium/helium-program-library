use anchor_lang::prelude::*;

#[error_code]
pub enum DataCreditsErrors {
  // 6000
  #[msg("Bump couldn't be found")]
  BumpNotAvailable,
}
