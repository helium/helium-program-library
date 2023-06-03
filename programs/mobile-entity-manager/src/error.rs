use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("The carrier is not approved")]
  CarrierNotApproved,
  #[msg("Names must be less than 32 characters")]
  InvalidStringLength,
  #[msg("Cannot swap tree until it is close to full")]
  TreeNotFull,
}
