use crate::{current_epoch, state::*, utils::*};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

use voter_stake_registry::{
  state::{LockupKind, PositionV0, Registrar},
  VoterStakeRegistry
};

#[derive(Accounts)]
pub struct DelegateV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    seeds = [b"position".as_ref(), mint.key().as_ref()],
    seeds::program = vsr_program.key(),
    bump = position.bump_seed,
    has_one = mint,
    has_one = registrar,
  )]
  pub position: Box<Account<'info, PositionV0>>,
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    token::mint = mint,
    token::authority = position_authority,
    constraint = position_token_account.amount > 0
  )]
  pub position_token_account: Box<Account<'info, TokenAccount>>,
  #[account(mut)]
  pub position_authority: Signer<'info>,
  pub registrar: AccountLoader<'info, Registrar>,
  #[account(
    has_one = registrar,
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    mut,
    has_one = dao,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(
    init_if_needed,
    payer = payer,
    space = 60 + 8 + std::mem::size_of::<SubDaoEpochInfoV0>(),
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &current_epoch(registrar.load()?.clock_unix_timestamp()).to_le_bytes()],
    bump,
  )]
  pub sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(
    init_if_needed,
    payer = payer,
    space = 60 + 8 + std::mem::size_of::<SubDaoEpochInfoV0>(),
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &current_epoch(position.lockup.end_ts).to_le_bytes()],
    bump,
  )]
  pub closing_time_sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,

  #[account(
    init,
    space = 60 + 8 + std::mem::size_of::<DelegatedPositionV0>(),
    payer = position_authority,
    seeds = ["delegated_position".as_bytes(), position.key().as_ref()],
    bump,
  )]
  pub delegated_position: Box<Account<'info, DelegatedPositionV0>>,

  pub vsr_program: Program<'info, VoterStakeRegistry>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<DelegateV0>) -> Result<()> {
  // load the vehnt information
  let position = &mut ctx.accounts.position;
  let registrar = &ctx.accounts.registrar.load()?;
  let voting_mint_config = &registrar.voting_mints[position.voting_mint_config_idx as usize];
  let curr_ts = registrar.clock_unix_timestamp();
  let available_vehnt = position.voting_power(voting_mint_config, curr_ts)?;

  let seconds_left = position.lockup.seconds_left(curr_ts);
  let future_ts = curr_ts
    .checked_add(seconds_left.try_into().unwrap())
    .unwrap();
  let future_vehnt = position.voting_power(voting_mint_config, future_ts)?;

  let fall_rate = calculate_fall_rate(available_vehnt, future_vehnt, seconds_left).unwrap();

  let curr_epoch = current_epoch(curr_ts);

  let sub_dao = &mut ctx.accounts.sub_dao;
  let delegated_position = &mut ctx.accounts.delegated_position;

  // Update the veHnt at start of epoch
  ctx.accounts.sub_dao_epoch_info.epoch =
    current_epoch(ctx.accounts.registrar.load()?.clock_unix_timestamp());
  update_subdao_vehnt(sub_dao, &mut ctx.accounts.sub_dao_epoch_info, curr_ts)?;

  sub_dao.vehnt_delegated = sub_dao
    .vehnt_delegated
    .checked_add(available_vehnt)
    .unwrap();
  sub_dao.vehnt_fall_rate = sub_dao.vehnt_fall_rate.checked_add(fall_rate).unwrap();

  if position.lockup.kind == LockupKind::Cliff {
    let closing_info = &mut ctx.accounts.closing_time_sub_dao_epoch_info;
    let vehnt_at_closing_epoch_start =
      position.voting_power(voting_mint_config, closing_info.start_ts())?;
    closing_info.vehnt_in_closing_positions = closing_info
      .vehnt_in_closing_positions
      .checked_add(vehnt_at_closing_epoch_start)
      .unwrap();
    closing_info.fall_rates_from_closing_positions = closing_info
      .fall_rates_from_closing_positions
      .checked_add(fall_rate)
      .unwrap();
  }

  delegated_position.purged = false;
  delegated_position.start_ts = curr_ts;
  delegated_position.hnt_amount = position.amount_deposited_native;
  delegated_position.last_claimed_epoch = curr_epoch;
  delegated_position.fall_rate = fall_rate;
  delegated_position.sub_dao = ctx.accounts.sub_dao.key();
  delegated_position.mint = ctx.accounts.mint.key();
  delegated_position.position = ctx.accounts.position.key();
  delegated_position.bump_seed = ctx.bumps["delegated_position"];

  ctx.accounts.sub_dao_epoch_info.sub_dao = ctx.accounts.sub_dao.key();
  ctx.accounts.sub_dao_epoch_info.bump_seed = *ctx.bumps.get("sub_dao_epoch_info").unwrap();
  ctx.accounts.sub_dao_epoch_info.initialized = true;

  Ok(())
}
