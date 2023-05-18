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
}
