use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("Invalid string length, your string was likely too long")]
  InvalidStringLength,

  #[msg("The string was not alphanumeric")]
  StringNotAlphanumeric,
  
  #[msg("Metadata Program Mismatch")]
  InvalidMetadataProgram,

  #[msg("The realloc increase was too large")]
  InvalidDataIncrease,  
}