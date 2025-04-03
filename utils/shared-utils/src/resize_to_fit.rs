use std::io::Write;

use anchor_lang::{
  prelude::*,
  solana_program::{entrypoint::MAX_PERMITTED_DATA_INCREASE, program::invoke, system_instruction},
};

use crate::error::ErrorCode;

pub struct IgnoreWriter {
  pub total: usize,
}

impl Write for IgnoreWriter {
  fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
    self.total += buf.len();
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

// Returns the lamports difference
pub fn resize_to_fit_pda<'info, T: AccountSerialize + AccountDeserialize + Owner + Clone>(
  payer: &AccountInfo<'info>,
  account: &Account<'info, T>,
) -> Result<i64> {
  let rent = Rent::get()?;
  let writer = &mut IgnoreWriter { total: 0 };
  account.try_serialize(writer)?;
  let new_size = writer.total + 64; // Pad enough for two pubkeys so deserialize doesn't fail
  let new_minimum_balance = rent.minimum_balance(new_size);
  let old_size = account.to_account_info().data.borrow().len();

  if new_size > old_size && (new_size - old_size) > MAX_PERMITTED_DATA_INCREASE {
    return Err(error!(ErrorCode::InvalidDataIncrease));
  }
  let total_change;
  if new_size > old_size {
    let lamports_diff = new_minimum_balance.saturating_sub(account.to_account_info().lamports());
    msg!("Resizing to {} with lamports {}", new_size, lamports_diff);
    **payer.to_account_info().lamports.borrow_mut() = payer
      .to_account_info()
      .lamports()
      .saturating_sub(lamports_diff);
    **account.to_account_info().lamports.borrow_mut() = account
      .to_account_info()
      .lamports()
      .saturating_add(lamports_diff);
    total_change = lamports_diff as i64;
  } else {
    let lamports_diff = new_minimum_balance.saturating_sub(account.to_account_info().lamports());
    msg!(
      "Resizing to {} with lamports refund {}",
      new_size,
      lamports_diff
    );
    **payer.to_account_info().lamports.borrow_mut() = payer
      .to_account_info()
      .lamports()
      .saturating_add(lamports_diff);
    **account.to_account_info().lamports.borrow_mut() = account
      .to_account_info()
      .lamports()
      .saturating_sub(lamports_diff);
    total_change = -(lamports_diff as i64);
  }

  account.to_account_info().realloc(new_size, false)?;

  Ok(total_change)
}
