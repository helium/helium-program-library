use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  MustCalculateVehntLinearly,
  #[msg("Rewards enrollment must be disabled to make changes to a position")]
  DisableRewardsEnrollment,
  #[msg("Epoch must be closed to claim rewards")]
  EpochNotClosed,
  #[msg("Epoch must be over to claim rewards")]
  EpochNotOver,
  #[msg("Rewards need to be claimed in the correct epoch order")]
  InvalidClaimEpoch,
  #[msg("Cannot enroll on a position ending this epoch")]
  NoEnrollEndingPosition,
  #[msg("Cannot change position while enrolled")]
  PositionChangeWhileEnrolled,
  #[msg("Marker has incorrect registrar")]
  InvalidMarker,
  ArithmeticError,
}
