use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("Error loading Pyth data")]
  PythError,
  BadInstructionsAccount,
  ProgramMismatch,
  UnknownInstruction,
  #[msg("Incorrect repayment destination")]
  IncorrectDestination,
  MissingRepay,
  InsufficientRepayAmount,
  PythPriceNotFound,
  ArithmeticError,
  IncorrectRepaymentMint,
  IncorrectRepaymentOwner,
}
