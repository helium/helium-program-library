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

  #[msg("Lockup hasn't expired yet")]
  LockupNotExpired,

  #[msg("This staking position has already been purged")]
  PositionAlreadyPurged,

  #[msg("This position is healthy, refresh not needed")]
  RefreshNotNeeded,

  #[msg("Failed to calculate the voting power")]
  FailedVotingPowerCalculation,

  #[msg("Rewards need to be claimed in the correct epoch order")]
  InvalidClaimEpoch,

  #[msg("Epochs start after the earliest emission schedule")]
  EpochTooEarly,

  #[msg("Must calculate vehnt linearly. Please ensure the previous epoch has been completed")]
  MustCalculateVehntLinearly,

  #[msg("Cannot change a position while it is delegated")]
  PositionChangeWhileDelegated,

  #[msg("This epoch was not closed, cannot claim rewards.")]
  EpochNotClosed,

  #[msg("Cannot delegate on a position ending this epoch")]
  NoDelegateEndingPosition,

  #[msg("Invalid vote marker")]
  InvalidMarker,

  #[msg("Must change delegation to a different sub dao")]
  InvalidChangeDelegationSubDao,

  #[msg("This position has mobile/iot rewards that need to be claimed before changing delegation")]
  ClaimBeforeChangeDelegation,
}
