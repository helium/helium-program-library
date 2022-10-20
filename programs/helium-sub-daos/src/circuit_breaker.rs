/// TODO: Anchor doesn't include things in the IDL unless they're in your crate. This sucks.
use anchor_lang::prelude::*;
use treasury_management::{
  circuit_breaker::{ThresholdType as CBThresholdType, WindowedCircuitBreakerConfigV0 as WindowConfig},
};

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

impl From<ThresholdType> for CBThresholdType {
  fn from(args: ThresholdType) -> Self {
    match args {
      ThresholdType::Absolute => CBThresholdType::Absolute,
      ThresholdType::Percent => CBThresholdType::Percent,
    }
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

impl From<WindowedCircuitBreakerConfigV0> for WindowConfig {
  fn from(config: WindowedCircuitBreakerConfigV0) -> Self {
    WindowConfig {
      window_size_seconds: config.window_size_seconds,
      threshold_type: config.threshold_type.into(),
      threshold: config.threshold,
    }
  }
}
