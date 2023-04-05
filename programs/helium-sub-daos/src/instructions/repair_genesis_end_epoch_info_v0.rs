use std::str::FromStr;

use crate::state::*;
use anchor_lang::{prelude::*, Discriminator};
use solana_program::{program::invoke, system_instruction};

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
  let mut data = ctx
    .accounts
    .genesis_end_sub_dao_epoch_info
    .try_borrow_mut_data()?;
  let data_vec = &data.to_vec();

  data[0..8].copy_from_slice(&SubDaoEpochInfoV0::discriminator()[..]);
  data[8..(data_vec.len() - 60 + 8)].copy_from_slice(&data_vec[0..(data_vec.len() - 60)]);

  Ok(())
}
