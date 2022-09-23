use crate::{error::ErrorCode, precise_number::PreciseNumber};
use std::{io::Write, convert::TryInto};

use anchor_lang::{
  prelude::*,
  solana_program::{entrypoint::MAX_PERMITTED_DATA_INCREASE, program::invoke, system_instruction},
};


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

pub struct IgnoreWriter {
  pub total: usize,
}

impl Write for IgnoreWriter {
  fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
    self.total += buf.len() as usize;
    Ok(buf.len())
  }

  fn flush(&mut self) -> std::io::Result<()> {
    Ok(())
  }
}

/// Resizes the account to the size of the struct
pub fn resize_to_fit<'info, T: AccountSerialize + AccountDeserialize + Owner + Clone>(
  payer: &AccountInfo<'info>,
  system_program: &AccountInfo<'info>,
  account: &Account<'info, T>,
) -> Result<()> {
  let rent = Rent::get()?;
  let writer = &mut IgnoreWriter { total: 0 };
  account.try_serialize(writer)?;
  let new_size = writer.total + 64; // Pad enough for two pubkeys so deserialize doesn't fail
  let new_minimum_balance = rent.minimum_balance(new_size);
  let lamports_diff = new_minimum_balance.saturating_sub(account.to_account_info().lamports());
  let old_size = account.to_account_info().data.borrow().len();

  if new_size > old_size && (new_size - old_size) > MAX_PERMITTED_DATA_INCREASE {
    return Err(error!(ErrorCode::InvalidDataIncrease));
  }
  msg!("Resizing to {} with lamports {}", new_size, lamports_diff);
  invoke(
    &system_instruction::transfer(payer.key, &account.key(), lamports_diff),
    &[
      payer.clone(),
      account.to_account_info().clone(),
      system_program.clone(),
    ],
  )?;

  account.to_account_info().realloc(new_size, false)?;

  Ok(())
}
