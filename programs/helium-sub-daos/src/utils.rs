use crate::{
  error::ErrorCode, precise_number::PreciseNumber, signed_precise_number::SignedPreciseNumber,
};
use anchor_lang::prelude::*;
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

pub fn current_epoch(unix_timestamp: i64) -> u64 {
  (unix_timestamp / (30 * 60)).try_into().unwrap()
}
