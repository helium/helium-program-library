use crate::{error::ErrorCode, state::*};
use anchor_lang::prelude::*;
use shared_utils::{precise_number::PreciseNumber, signed_precise_number::SignedPreciseNumber};
use std::convert::TryInto;
use time::{Duration, OffsetDateTime};

pub trait OrArithError<T> {
  fn or_arith_error(self) -> Result<T>;
}

impl OrArithError<PreciseNumber> for Option<PreciseNumber> {
  fn or_arith_error(self) -> Result<PreciseNumber> {
    self.ok_or_else(|| ErrorCode::ArithmeticError.into())
  }
}

impl OrArithError<SignedPreciseNumber> for Option<SignedPreciseNumber> {
  fn or_arith_error(self) -> Result<SignedPreciseNumber> {
    self.ok_or_else(|| ErrorCode::ArithmeticError.into())
  }
}

pub const EPOCH_LENGTH: i64 = 24 * 60 * 60;

pub fn current_epoch(unix_timestamp: i64) -> u64 {
  (unix_timestamp / (EPOCH_LENGTH)).try_into().unwrap()
}

pub fn next_epoch_ts(unix_timestamp: i64) -> u64 {
  (current_epoch(unix_timestamp) + 1) * u64::try_from(EPOCH_LENGTH).unwrap()
}

pub fn update_subdao_vehnt(
  sub_dao: &mut SubDaoV0,
  curr_epoch_info: &mut SubDaoEpochInfoV0,
  curr_ts: i64,
) -> Result<()> {
  if curr_ts < sub_dao.vehnt_last_calculated_ts {
    return Ok(());
  }

  msg!(
    "Current vehnt is {} with last updated of {}. Fast forwarding to {} at fall rate {}",
    sub_dao.vehnt_delegated,
    sub_dao.vehnt_last_calculated_ts,
    curr_ts,
    sub_dao.vehnt_fall_rate
  );

  // If last calculated was more than an epoch ago
  let epoch_start = curr_epoch_info.start_ts();
  if epoch_start
    .checked_sub(sub_dao.vehnt_last_calculated_ts)
    .unwrap()
    > EPOCH_LENGTH
  {
    return Err(error!(ErrorCode::MustCalculateVehntLinearly));
  }

  // Step 1. Update veHNT up to the point that this epoch starts
  if epoch_start > sub_dao.vehnt_last_calculated_ts {
    let fall = sub_dao
      .vehnt_fall_rate
      .checked_mul(
        u128::try_from(epoch_start)
          .unwrap()
          .checked_sub(u128::try_from(sub_dao.vehnt_last_calculated_ts).unwrap())
          .unwrap(),
      )
      .unwrap()
      .checked_div(FALL_RATE_FACTOR)
      .unwrap();

    sub_dao.vehnt_delegated = sub_dao
      .vehnt_delegated
      .checked_sub(u64::try_from(fall).unwrap())
      .unwrap();
  }

  // If sub dao epoch info account was just created, log the vehnt
  if !curr_epoch_info.initialized {
    msg!(
      "Setting vehnt_at_epoch_start to {}",
      sub_dao.vehnt_delegated
    );
    curr_epoch_info.vehnt_at_epoch_start = sub_dao.vehnt_delegated;
  }

  // Step 2. Update fall rate according to this epoch's closed position corrections
  if curr_epoch_info.fall_rates_from_closing_positions > 0
    || curr_epoch_info.vehnt_in_closing_positions > 0
  {
    msg!(
      "Correcting fall rate by {} and vehnt by {} due to closed positions",
      curr_epoch_info.fall_rates_from_closing_positions,
      curr_epoch_info.vehnt_in_closing_positions
    );
    sub_dao.vehnt_fall_rate = sub_dao
      .vehnt_fall_rate
      .checked_sub(curr_epoch_info.fall_rates_from_closing_positions)
      .unwrap();

    sub_dao.vehnt_delegated = sub_dao
      .vehnt_delegated
      .checked_sub(curr_epoch_info.vehnt_in_closing_positions)
      .unwrap();
    // Since this has already been applied, set to 0
    curr_epoch_info.fall_rates_from_closing_positions = 0;
    curr_epoch_info.vehnt_in_closing_positions = 0;
  }

  // Step 3. Update veHNT up to now (from start of epoch) using the current fall rate. At this point, closing positions are effectively ignored.
  let fall = sub_dao
    .vehnt_fall_rate
    .checked_mul(
      u128::try_from(curr_ts)
        .unwrap()
        .checked_sub(
          u128::try_from(std::cmp::max(sub_dao.vehnt_last_calculated_ts, epoch_start)).unwrap(),
        )
        .unwrap(),
    )
    .unwrap()
    .checked_div(FALL_RATE_FACTOR)
    .unwrap();

  sub_dao.vehnt_delegated = sub_dao
    .vehnt_delegated
    .checked_sub(u64::try_from(fall).unwrap())
    .unwrap();
  sub_dao.vehnt_last_calculated_ts = curr_ts;

  Ok(())
}

pub fn create_cron(execution_ts: i64, offset: i64) -> String {
  let expiry_dt = OffsetDateTime::from_unix_timestamp(execution_ts)
    .ok()
    .unwrap()
    .checked_add(Duration::new(offset, 0)) // call purge ix two hours after expiry
    .unwrap();
  format!(
    "0 {:?} {:?} {:?} {:?} * {:?}",
    expiry_dt.minute(),
    expiry_dt.hour(),
    expiry_dt.day(),
    expiry_dt.month(),
    expiry_dt.year(),
  )
}

pub const FALL_RATE_FACTOR: u128 = 1_000_000_000_000;

pub fn calculate_fall_rate(curr_vp: u64, future_vp: u64, num_seconds: u64) -> Option<u128> {
  let diff: u128 = u128::from(curr_vp.checked_sub(future_vp).unwrap())
    .checked_mul(FALL_RATE_FACTOR)
    .unwrap(); // add decimals of precision for fall rate calculation

  diff.checked_div(num_seconds.into())
}
