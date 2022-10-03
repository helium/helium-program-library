use crate::{error::ErrorCode, precise_number::PreciseNumber};
use std::convert::TryInto;

use anchor_lang::prelude::*;

pub trait OrArithError<T> {
  fn or_arith_error(self) -> Result<T>;
}

impl OrArithError<PreciseNumber> for Option<PreciseNumber> {
  fn or_arith_error(self) -> Result<PreciseNumber> {
    self.ok_or(ErrorCode::ArithmeticError.into())
  }
}

pub fn current_epoch(unix_timestamp: i64) -> u64 {
  (unix_timestamp / (30 * 60)).try_into().unwrap()
}
