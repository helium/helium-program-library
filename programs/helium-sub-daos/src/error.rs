use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("The realloc increase was too large")]
  InvalidDataIncrease,

  #[msg("Error in arithmetic")]
  ArithmeticError,

  #[msg("Utility score was already calculated for this sub dao")]
  UtilityScoreAlreadyCalculated,

  #[msg("Cannot calculate rewards until the epoch is over")]
  EpochNotOver,

  #[msg("All utility scores must be calculated before rewards can be issued")]
  MissingUtilityScores,

  #[msg("The subdao does not have a utility score")]
  NoUtilityScore,

  #[msg("Not enough veHNT")]
  NotEnoughVeHnt,
}
