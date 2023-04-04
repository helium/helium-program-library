use std::str::FromStr;

use crate::state::*;
use anchor_lang::{prelude::*, Discriminator};
use solana_program::{system_instruction, program::invoke};

#[derive(Accounts)]
pub struct RepairGenesisEndEpochInfoV0<'info> {
  /// CHECK: No.
  #[account(mut)]
  pub genesis_end_sub_dao_epoch_info: UncheckedAccount<'info>,  
  #[account(
    address = Pubkey::from_str("devXCnFPU71StPEFNnGRf4iqXoRpYkNsGEg9m757ktP").unwrap()
  )]
  pub authority: Signer<'info>,

  #[account(mut)]
  pub payer: Signer<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RepairGenesisEndEpochInfoV0>) -> Result<()> {
  let mut data = ctx.accounts.genesis_end_sub_dao_epoch_info.try_borrow_mut_data()?;
  let data_vec = &data.to_vec();
  let new_size = data_vec.len() + 8; 
  let new_minimum_balance = Rent::get()?.minimum_balance(new_size);
  let lamports_diff = new_minimum_balance.saturating_sub(ctx.accounts.genesis_end_sub_dao_epoch_info.to_account_info().lamports());

  msg!("Resizing to {} with lamports {}", new_size, lamports_diff);
  invoke(
    &system_instruction::transfer(&ctx.accounts.payer.key(), &ctx.accounts.genesis_end_sub_dao_epoch_info.key(), lamports_diff),
    &[
      ctx.accounts.payer.to_account_info().clone(),
      ctx.accounts.genesis_end_sub_dao_epoch_info.to_account_info().clone(),
      ctx.accounts.system_program.to_account_info().clone(),
    ],
  )?;

  ctx.accounts.genesis_end_sub_dao_epoch_info.to_account_info().realloc(new_size, false)?;
  data[0..8].copy_from_slice(&SubDaoEpochInfoV0::discriminator()[..]);
  data[8..(data_vec.len() + 8)].copy_from_slice(data_vec);
  ctx.accounts.genesis_end_sub_dao_epoch_info.exit(&crate::id())?;

  Ok(())
}