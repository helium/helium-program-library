use crate::{errors::ErrorCode, WindowV0, WindowedCircuitBreakerConfigV0};
use anchor_lang::prelude::*;

pub fn get_new_aggregated_value(
  config: &WindowedCircuitBreakerConfigV0,
  window: &WindowV0,
  unix_timestamp: i64,
) -> Option<u64> {
  let time_elapsed = unix_timestamp.checked_sub(window.last_unix_timestamp)?;
  u64::try_from(
    u128::from(window.last_aggregated_value)
      .checked_mul(
        // (window_size_seconds - max(window_size_seconds, time_elapsed)) / window_size_seconds
        // = (1 -  max((time_elapsed / window_size_seconds), 1))
        u128::from(
          config.window_size_seconds
            .checked_sub(std::cmp::max(
              u64::try_from(time_elapsed).ok()?, 
              config.window_size_seconds
            ))?,
        ),
      )?
      .checked_div(u128::from(config.window_size_seconds))?,
  ).ok()
}

pub fn get_threshold(threshold_percent: u32, curr_value: u64) -> Option<u64> {
  u64::try_from(
    u128::from(curr_value)
      .checked_mul(u128::from(threshold_percent))?
      .checked_div(u128::from(u32::MAX))?,
  ).ok()
}

pub fn enforce_window(
  config: &WindowedCircuitBreakerConfigV0,
  window: &WindowV0,
  curr_value: u64,
  unix_timestamp: i64,
) -> Result<WindowV0> {
  let threshold = get_threshold(config.threshold_percent, curr_value)
    .ok_or(error!(ErrorCode::ArithmeticError))?;

  let new_aggregated_value = get_new_aggregated_value(config, window, unix_timestamp)
    .ok_or(error!(ErrorCode::ArithmeticError))?;

  if new_aggregated_value.checked_add(curr_value).ok_or(error!(ErrorCode::ArithmeticError))? > threshold {
    return Err(ErrorCode::CircuitBreakerTriggered.into());
  }

  Ok(WindowV0 {
    last_aggregated_value: new_aggregated_value,
    last_unix_timestamp: unix_timestamp,
  })
}
