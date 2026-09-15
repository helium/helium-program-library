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

  #[msg("Remote task signer must be the pinned DCA signer")]
  InvalidDcaSigner,

  #[msg("Remote task url must address the pinned DCA service")]
  InvalidDcaUrl,

  #[msg("Slippage from oracle must be less than 100%")]
  InvalidSlippage,

  #[msg("The run must supply the task the next order is queued into")]
  MissingNextTask,
}
