use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("The circuit breaker was triggered")]
  CircuitBreakerTriggered,

  #[msg("Error in arithmetic")]
  ArithmeticError,
}
