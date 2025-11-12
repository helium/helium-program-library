use anchor_lang::prelude::*;

#[derive(Default, AnchorSerialize, AnchorDeserialize, Clone)]
pub struct WindowV0 {
  pub last_aggregated_value: u64,
  pub last_unix_timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub enum ThresholdType {
  #[default]
  Percent,
  Absolute,
}

#[derive(Default, AnchorSerialize, AnchorDeserialize, Clone)]
pub struct WindowedCircuitBreakerConfigV0 {
  pub window_size_seconds: u64,
  pub threshold_type: ThresholdType,
  // Percent: Denoted as amount / u64.MAX_VALUE
  // Absolute: Denoted as amount
  pub threshold: u64,
}

impl WindowedCircuitBreakerConfigV0 {
  pub fn is_valid(&self) -> bool {
    self.window_size_seconds > 0
  }
}

#[account]
#[derive(Default)]
pub struct MintWindowedCircuitBreakerV0 {
  pub mint: Pubkey,
  pub authority: Pubkey,
  pub mint_authority: Pubkey,
  pub config: WindowedCircuitBreakerConfigV0,
  pub last_window: WindowV0,
  pub bump_seed: u8,
}

#[macro_export]
macro_rules! mint_windowed_circuit_breaker_seeds {
  ( $cb:expr ) => {
    &[
      b"mint_windowed_breaker".as_ref(),
      $cb.mint.as_ref(),
      &[$cb.bump_seed],
    ]
  };
}

#[account]
#[derive(Default)]
pub struct AccountWindowedCircuitBreakerV0 {
  pub token_account: Pubkey,
  pub authority: Pubkey,
  pub owner: Pubkey,
  pub config: WindowedCircuitBreakerConfigV0,
  pub last_window: WindowV0,
  pub bump_seed: u8,
}
