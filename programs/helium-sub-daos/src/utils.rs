use crate::{error::ErrorCode, state::*};
use anchor_lang::prelude::*;
use shared_utils::{precise_number::PreciseNumber, signed_precise_number::SignedPreciseNumber};
use std::convert::TryInto;

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
  sub_dao.vehnt_staked = sub_dao
    .vehnt_staked
    .checked_sub(
      u64::try_from(
        (curr_ts - sub_dao.vehnt_last_calculated_ts)
          * i64::try_from(sub_dao.vehnt_fall_rate).unwrap(),
      )
      .unwrap(),
    )
    .unwrap();
  sub_dao.vehnt_last_calculated_ts = curr_ts;
}
