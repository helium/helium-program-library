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

pub fn update_subdao_vehnt(sub_dao: &mut SubDaoV0, curr_ts: i64) {
  if curr_ts < sub_dao.vehnt_last_calculated_ts {
    return;
  }

  let fall: u64 = PreciseNumber::new(sub_dao.vehnt_fall_rate.into())
    .unwrap()
    .checked_mul(
      &PreciseNumber::new(
        (curr_ts
          .checked_sub(sub_dao.vehnt_last_calculated_ts)
          .unwrap())
        .try_into()
        .unwrap(),
      )
      .unwrap(),
    )
    .unwrap()
    .checked_div(&PreciseNumber::new(FALL_RATE_FACTOR).unwrap())
    .unwrap()
    .to_imprecise()
    .unwrap()
    .try_into()
    .ok()
    .unwrap();

  sub_dao.vehnt_staked = sub_dao.vehnt_staked.checked_sub(fall).unwrap();
  sub_dao.vehnt_last_calculated_ts = curr_ts;
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

  diff
    .checked_div(num_seconds.into())
}
