use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("The realloc increase was too large")]
  InvalidDataIncrease,

  #[msg("Error in arithmetic")]
  ArithmeticError,

  #[msg("Provided asset was invalid")]
  InvalidAsset,

  #[msg("Oracle index was out of range")]
  InvalidOracleIndex,

  #[msg("Approver signature required")]
  InvalidApproverSignature,

  #[msg("This recipient uses a custom destination. Use distribute_custom_destination_v0")]
  CustomDestination,
}
