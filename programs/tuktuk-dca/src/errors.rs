use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("Invalid CPI context - must be called from tuktuk")]
  InvalidCpiContext,

  #[msg("Slippage exceeded - repayment amount below oracle price")]
  SlippageExceeded,

  #[msg("Pyth price not found or stale")]
  PythPriceNotFound,

  #[msg("Arithmetic error")]
  ArithmeticError,

  #[msg("Lend not called - pre_swap_destination_balance not set")]
  LendNotCalled,

  #[msg("Invalid number of orders remaining")]
  InvalidNumOrders,
}
