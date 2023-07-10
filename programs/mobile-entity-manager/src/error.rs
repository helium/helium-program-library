use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("The carrier is not approved")]
  CarrierNotApproved,
  #[msg("Names, symbols and urls must be less than 32, 10, and 200 characters respectively")]
  InvalidStringLength,
  #[msg("Cannot swap tree until it is close to full")]
  TreeNotFull,
}
