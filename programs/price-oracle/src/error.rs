use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("The realloc increase was too large")]
  InvalidDataIncrease,

  #[msg("Not authorised to submit a price")]
  UnauthorisedOracle,

  #[msg("Unable to update price")]
  InvalidPriceUpdate,

  #[msg("Invalid argument")]
  InvalidArgs,
}
