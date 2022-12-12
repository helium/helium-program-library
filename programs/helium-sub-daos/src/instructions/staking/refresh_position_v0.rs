use crate::{error::ErrorCode, state::*, utils::*};
use anchor_lang::prelude::*;
use voter_stake_registry::state::{Registrar, Voter};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct RefreshPositionArgsV0 {
  pub deposit_entry_idx: u8,
}

#[derive(Accounts)]
#[instruction(args: RefreshPositionArgsV0)]
pub struct RefreshPositionV0<'info> {
  #[account(
    seeds = [registrar.key().as_ref(), b"voter".as_ref(), voter_authority.key().as_ref()],
    seeds::program = vsr_program.key(),
    bump,
    has_one = voter_authority,
    has_one = registrar,
  )]
  pub vsr_voter: AccountLoader<'info, Voter>,
  #[account(mut)]
  pub voter_authority: Signer<'info>,
  #[account(
    seeds = [registrar.load()?.realm.as_ref(), b"registrar".as_ref(), dao.hnt_mint.as_ref()],
    seeds::program = vsr_program.key(),
    bump,
  )]
  pub registrar: AccountLoader<'info, Registrar>,
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    mut,
    has_one = dao,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,

  #[account(
    mut,
    seeds = ["stake_position".as_bytes(), voter_authority.key().as_ref(), &[args.deposit_entry_idx]],
    bump,
  )]
  pub stake_position: Account<'info, StakePositionV0>,

  ///CHECK: constraints
  #[account(address = voter_stake_registry::ID)]
  pub vsr_program: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
  pub clock: Sysvar<'info, Clock>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<RefreshPositionV0>, args: RefreshPositionArgsV0) -> Result<()> {
  // load the vehnt information
  let voter = ctx.accounts.vsr_voter.load()?;
  let registrar = &ctx.accounts.registrar.load()?;
  let d_entry = voter.deposits[args.deposit_entry_idx as usize];
  let voting_mint_config = &registrar.voting_mints[d_entry.voting_mint_config_idx as usize];
  let curr_ts = registrar.clock_unix_timestamp();
  let available_vehnt = d_entry.voting_power(voting_mint_config, curr_ts)?;
  let seconds_left = d_entry
    .lockup
    .seconds_left(curr_ts)
    .checked_sub(10)
    .unwrap();
  let future_ts = curr_ts
    .checked_add(seconds_left.try_into().unwrap())
    .unwrap();
  let future_vehnt = d_entry.voting_power(voting_mint_config, future_ts)?;

  let fall_rate = calculate_fall_rate(available_vehnt, future_vehnt, seconds_left).unwrap();

  let stake_position = &mut ctx.accounts.stake_position;
  let expiry_ts = curr_ts
    .checked_add(d_entry.lockup.seconds_left(curr_ts).try_into().unwrap())
    .unwrap();
  if stake_position.hnt_amount <= d_entry.amount_deposited_native
    && stake_position.expiry_ts == expiry_ts
  {
    // this position doesn't need to be refreshed
    return Err(error!(ErrorCode::RefreshNotNeeded));
  }
  // this position needs to be reduced

  let old_position_vehnt = calculate_voting_power(
    d_entry,
    voting_mint_config,
    stake_position.hnt_amount,
    stake_position.hnt_amount,
    curr_ts,
  )?;

  let sub_dao = &mut ctx.accounts.sub_dao;

  let vehnt_diff = old_position_vehnt.checked_sub(available_vehnt).unwrap();
  let fall_rate_diff = stake_position.fall_rate.checked_sub(fall_rate).unwrap();
  // update subdao calculations
  update_subdao_vehnt(sub_dao, curr_ts);

  sub_dao.vehnt_staked = sub_dao.vehnt_staked.checked_sub(vehnt_diff).unwrap();
  sub_dao.vehnt_fall_rate = sub_dao.vehnt_fall_rate.checked_sub(fall_rate_diff).unwrap();

  // update the stake position
  stake_position.fall_rate = fall_rate;
  stake_position.hnt_amount = d_entry.amount_deposited_native;
  stake_position.last_claimed_epoch = current_epoch(curr_ts);
  stake_position.expiry_ts = expiry_ts;

  Ok(())
}
