use crate::{error::ErrorCode, state::*, utils::*};
use anchor_lang::prelude::*;
use voter_stake_registry::state::{PositionV0, Registrar};

#[derive(Accounts)]
pub struct RefreshPositionV0<'info> {
  #[account(
    has_one = registrar,
  )]
  pub position: Box<Account<'info, PositionV0>>,
  pub registrar: AccountLoader<'info, Registrar>,
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    mut,
    has_one = dao,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,

  #[account(
    mut,
    has_one = sub_dao,
    has_one = position,
    seeds = [b"stake_position", position.key().as_ref()],
    bump = stake_position.bump_seed
  )]
  pub stake_position: Account<'info, StakePositionV0>,

  ///CHECK: constraints
  #[account(address = voter_stake_registry::ID)]
  pub vsr_program: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
  pub clock: Sysvar<'info, Clock>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<RefreshPositionV0>) -> Result<()> {
  // load the vehnt information
  let position = &mut ctx.accounts.position;
  let voting_mint_config =
    &ctx.accounts.registrar.load()?.voting_mints[position.voting_mint_config_idx as usize];
  let curr_ts = ctx.accounts.clock.unix_timestamp;
  let available_vehnt = position.voting_power(voting_mint_config, curr_ts)?;
  let seconds_left = position.lockup.seconds_left(curr_ts);
  let future_ts = curr_ts
    .checked_add(seconds_left.try_into().unwrap())
    .unwrap();
  let future_vehnt = position.voting_power(voting_mint_config, future_ts)?;

  let fall_rate = calculate_fall_rate(available_vehnt, future_vehnt, seconds_left).unwrap();

  let stake_position = &mut ctx.accounts.stake_position;
  let expiry_ts = curr_ts
    .checked_add(position.lockup.seconds_left(curr_ts).try_into().unwrap())
    .unwrap();
  if stake_position.hnt_amount == position.amount_deposited_native
    && stake_position.expiry_ts == expiry_ts
  {
    // this position doesn't need to be refreshed
    return Err(error!(ErrorCode::RefreshNotNeeded));
  }
  // this position needs to be reduced

  let old_position_vehnt =
    position.voting_power_with_deposits(voting_mint_config, curr_ts, stake_position.hnt_amount)?;

  let sub_dao = &mut ctx.accounts.sub_dao;

  let vehnt_diff = i128::from(old_position_vehnt)
    .checked_sub(i128::from(available_vehnt))
    .unwrap();
  let fall_rate_diff = i128::try_from(stake_position.fall_rate)
    .unwrap()
    .checked_sub(i128::try_from(fall_rate).unwrap())
    .unwrap();
  // update subdao calculations
  update_subdao_vehnt(sub_dao, curr_ts);

  sub_dao.vehnt_staked = i128::from(sub_dao.vehnt_staked)
    .checked_sub(vehnt_diff)
    .unwrap();
  sub_dao.vehnt_fall_rate = u128::try_from(
    i128::try_from(sub_dao.vehnt_fall_rate)
      .unwrap()
      .checked_sub(fall_rate_diff)
      .unwrap(),
  )
  .unwrap();

  // update the stake position
  stake_position.fall_rate = fall_rate;
  stake_position.hnt_amount = position.amount_deposited_native;
  stake_position.last_claimed_epoch = current_epoch(curr_ts);
  stake_position.expiry_ts = expiry_ts;

  Ok(())
}
