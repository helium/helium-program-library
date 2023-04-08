use std::str::FromStr;

use crate::state::*;
use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct SubDaoEpochInfoOriginal {
  pub epoch: u64,
  pub sub_dao: Pubkey,
  pub dc_burned: u64,
  pub vehnt_at_epoch_start: u64,
  pub vehnt_in_closing_positions: u64,
  pub fall_rates_from_closing_positions: u128,
  pub delegation_rewards_issued: u64,
  pub utility_score: Option<u128>,
  pub rewards_issued_at: Option<i64>,
  pub bump_seed: u8,
  pub initialized: bool,
}

#[derive(Accounts)]
pub struct RepairSubDaoEpochInfoV0<'info> {
  /// CHECK: No.
  #[account(mut)]
  pub sub_dao_epoch_info: UncheckedAccount<'info>,
  #[account(
    address = Pubkey::from_str("devXCnFPU71StPEFNnGRf4iqXoRpYkNsGEg9m757ktP").unwrap()
  )]
  pub authority: Signer<'info>,

  #[account(mut)]
  pub payer: Signer<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RepairSubDaoEpochInfoV0>) -> Result<()> {
  let mut data = ctx.accounts.sub_dao_epoch_info.try_borrow_mut_data()?;
  let original = SubDaoEpochInfoOriginal::try_from_slice(&data[8..])?;
  let new = SubDaoEpochInfoV0 {
    epoch: original.epoch,
    sub_dao: original.sub_dao,
    dc_burned: original.dc_burned,
    vehnt_at_epoch_start: original.vehnt_at_epoch_start,
    vehnt_in_closing_positions: original.vehnt_in_closing_positions.into(),
    fall_rates_from_closing_positions: original.fall_rates_from_closing_positions,
    delegation_rewards_issued: original.delegation_rewards_issued,
    utility_score: original.utility_score,
    rewards_issued_at: original.rewards_issued_at,
    bump_seed: original.bump_seed,
    initialized: original.initialized,
  };
  let vec = &new.try_to_vec()?;

  data[8..(vec.len() + 8)].copy_from_slice(vec);
  ctx.accounts.sub_dao_epoch_info.exit(&crate::id())?;

  Ok(())
}
