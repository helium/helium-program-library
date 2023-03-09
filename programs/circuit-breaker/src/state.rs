use anchor_lang::prelude::*;

#[derive(Default, AnchorSerialize, AnchorDeserialize, Clone)]
pub struct WindowV0 {
  pub last_aggregated_value: u64,
  pub last_unix_timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum ThresholdType {
  Percent,
  Absolute,
}

impl Default for ThresholdType {
  fn default() -> Self {
    Self::Percent
  }
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
