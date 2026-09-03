use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("Error in arithmetic")]
  ArithmeticError,
  #[msg("Staked shares would exceed the fanout's total shares")]
  TooManyShares,
  #[msg("A distribution must leave the fanout's token account")]
  InvalidDestination,
  #[msg("A stake must be at least one share")]
  ZeroStake,
  #[msg("A fanout needs a membership mint with a supply to divide")]
  NoShares,
}
