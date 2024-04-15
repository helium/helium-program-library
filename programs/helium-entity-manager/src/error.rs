use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("Invalid ecc compcat")]
  InvalidEccCompact,

  #[msg("Invalid string length, your string was likely too long")]
  InvalidStringLength,

  #[msg("The string was not alphanumeric")]
  StringNotAlphanumeric,

  #[msg("Metadata Program Mismatch")]
  InvalidMetadataProgram,

  #[msg("The realloc increase was too large")]
  InvalidDataIncrease,

  #[msg("Genesis endpoints are currently disabled")]
  NoGenesis,

  #[msg("The tree can only be replaced when it is close to full")]
  TreeNotFull,

  #[msg("The provided tree is an invalid size")]
  InvalidTreeSpace,

  #[msg("Invalid seeds provided")]
  InvalidSeeds,

  #[msg("Invalid settings provided")]
  InvalidSettings,

  #[msg("Invalid DC fee")]
  InvalidDcFee,

  #[msg("Onboarding fee has already been set for this account")]
  OnboardingFeeAlreadySet,

  #[msg("Account doesn't matched expected address")]
  InvalidAccountAddress,

  #[msg("Invalid symbol, must be 'IOT' or 'MOBILE'")]
  InvalidSymbol,
  #[msg("Mobile device type not found")]
  InvalidDeviceType,
  #[msg("Error loading Pyth data")]
  PythError,

  #[msg("Pyth price is not available")]
  PythPriceNotFound,

  #[msg("Pyth price is stale")]
  PythPriceFeedStale,

  #[msg("Arithmetic error")]
  ArithmeticError,
}
