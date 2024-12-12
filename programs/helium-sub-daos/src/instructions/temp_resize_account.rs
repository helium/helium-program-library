use std::str::FromStr;

use anchor_lang::{
  prelude::*,
  solana_program::{program::invoke, system_instruction},
};
use voter_stake_registry::TESTING;

use crate::RecentProposal;

#[derive(Accounts)]
pub struct TempResizeAccount<'info> {
  #[account(
    mut,
    address = if TESTING { payer.key() } else { Pubkey::from_str("hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW").unwrap() }
  )]
  pub payer: Signer<'info>,
  /// CHECK: Resizing account
  #[account(mut)]
  pub account: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<TempResizeAccount>) -> Result<()> {
  let account = &mut ctx.accounts.account;
  let new_size = account.data_len() + std::mem::size_of::<RecentProposal>() * 4;
  let rent = Rent::get()?;
  let new_minimum_balance = rent.minimum_balance(new_size);
  let lamports_diff = new_minimum_balance.saturating_sub(account.to_account_info().lamports());

  invoke(
    &system_instruction::transfer(ctx.accounts.payer.key, &account.key(), lamports_diff),
    &[
      ctx.accounts.payer.to_account_info().clone(),
      account.to_account_info().clone(),
      ctx.accounts.system_program.to_account_info().clone(),
    ],
  )?;
  account.to_account_info().realloc(new_size, false)?;

  Ok(())
}
