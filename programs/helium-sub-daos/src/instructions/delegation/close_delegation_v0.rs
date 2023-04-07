use crate::{
  caclulate_vhnt_info, current_epoch, id, state::*, update_subdao_vehnt, VehntInfo,
  FALL_RATE_FACTOR, TESTING,
};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

use voter_stake_registry::{
  state::{LockupKind, PositionV0, Registrar},
  VoterStakeRegistry,
};

#[derive(Accounts)]
pub struct CloseDelegationV0<'info> {
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
  pub registrar: Box<Account<'info, Registrar>>,
  #[account(
    has_one = registrar
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    mut,
    has_one = dao,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,

  #[account(
    mut,
    close = position_authority,
    seeds = ["delegated_position".as_bytes(), position.key().as_ref()],
    has_one = position,
    has_one = sub_dao,
    bump
  )]
  pub delegated_position: Account<'info, DelegatedPositionV0>,
  #[account(
    init_if_needed,
    payer = payer,
    space = 60 + 8 + std::mem::size_of::<SubDaoEpochInfoV0>(),
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &current_epoch(registrar.clock_unix_timestamp()).to_le_bytes()],
    bump,
  )]
  pub sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  // We know these two accounts are initialized because
  // They were used when delegate_v0 was called
  #[account(
    mut,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &current_epoch(position.lockup.end_ts).to_le_bytes()],
    bump = closing_time_sub_dao_epoch_info.bump_seed,
  )]
  pub closing_time_sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(
    mut,
    seeds = [
      "sub_dao_epoch_info".as_bytes(), 
      sub_dao.key().as_ref(),
      &current_epoch(
        // Avoid passing an extra account if the end is 0 (no genesis on this position).
        // Pass instead closing time epoch info, txn account deduplication will reduce the overall tx size
        if position.genesis_end < registrar.clock_unix_timestamp() {
          position.lockup.end_ts
        } else {
          position.genesis_end
        }
      ).to_le_bytes()
    ],
    bump = genesis_end_sub_dao_epoch_info.bump_seed,
  )]
  pub genesis_end_sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,

  pub vsr_program: Program<'info, VoterStakeRegistry>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CloseDelegationV0>) -> Result<()> {
  // load the vehnt information
  let position = &mut ctx.accounts.position;
  let registrar = &ctx.accounts.registrar;
  let voting_mint_config = &registrar.voting_mints[position.voting_mint_config_idx as usize];
  let curr_ts = registrar.clock_unix_timestamp();
  let vehnt_at_curr_ts = position.voting_power(voting_mint_config, curr_ts)?;
  let vehnt_info = caclulate_vhnt_info(
    ctx.accounts.delegated_position.start_ts,
    position,
    voting_mint_config,
  )?;

  let VehntInfo {
    pre_genesis_end_fall_rate,
    post_genesis_end_fall_rate,
    genesis_end_fall_rate_correction,
    genesis_end_vehnt_correction,
    end_fall_rate_correction,
    end_vehnt_correction,
    ..
  } = vehnt_info;

  msg!("Vehnt calculations: {:?}", vehnt_info);

  // don't allow unstake without claiming available rewards
  // unless we're testing, in which case we don't care
  let curr_epoch = current_epoch(curr_ts);
  assert!((ctx.accounts.delegated_position.last_claimed_epoch >= curr_epoch - 1) || TESTING);

  let delegated_position = &mut ctx.accounts.delegated_position;
  let sub_dao = &mut ctx.accounts.sub_dao;

  ctx.accounts.sub_dao_epoch_info.epoch = current_epoch(curr_ts);
  update_subdao_vehnt(sub_dao, &mut ctx.accounts.sub_dao_epoch_info, curr_ts)?;

  // Update the ending epochs with this new info
  ctx
    .accounts
    .closing_time_sub_dao_epoch_info
    .fall_rates_from_closing_positions = ctx
    .accounts
    .closing_time_sub_dao_epoch_info
    .fall_rates_from_closing_positions
    .checked_sub(end_fall_rate_correction)
    .unwrap();

  ctx
    .accounts
    .closing_time_sub_dao_epoch_info
    .vehnt_in_closing_positions = ctx
    .accounts
    .closing_time_sub_dao_epoch_info
    .vehnt_in_closing_positions
    .checked_sub(end_vehnt_correction)
    .unwrap();

  // Closing time and genesis end can be the same account
  let mut parsed: Account<SubDaoEpochInfoV0>;
  let end_and_genesis_same = ctx.accounts.genesis_end_sub_dao_epoch_info.key()
    == ctx.accounts.closing_time_sub_dao_epoch_info.key();
  let genesis_end_sub_dao_epoch_info: &mut Account<SubDaoEpochInfoV0> = if end_and_genesis_same {
    &mut ctx.accounts.closing_time_sub_dao_epoch_info
  } else {
    parsed = Account::try_from(
      &ctx
        .accounts
        .genesis_end_sub_dao_epoch_info
        .to_account_info(),
    )?;
    &mut parsed
  };
  genesis_end_sub_dao_epoch_info.fall_rates_from_closing_positions = genesis_end_sub_dao_epoch_info
    .fall_rates_from_closing_positions
    .checked_sub(genesis_end_fall_rate_correction)
    .unwrap();

  genesis_end_sub_dao_epoch_info.vehnt_in_closing_positions = genesis_end_sub_dao_epoch_info
    .vehnt_in_closing_positions
    .checked_sub(genesis_end_vehnt_correction)
    .unwrap();

  if end_and_genesis_same {
    // Ensure ordering of exit is correct
    // If we don't do this, genesis end could exit last and overwrite the values
    genesis_end_sub_dao_epoch_info.exit(&id())?;
    ctx.accounts.genesis_end_sub_dao_epoch_info.reload()?;
  }

  // Only subtract from the stake if the position ends after the end of this epoch. Otherwise,
  // the position was already purged due to the sub_dao_epoch_info closing info logic.
  if position.lockup.end_ts >= ctx.accounts.sub_dao_epoch_info.end_ts()
    || position.lockup.kind == LockupKind::Constant
  {
    msg!(
      "Current vehnt {}, removing {} from the subdao",
      sub_dao.vehnt_delegated,
      vehnt_at_curr_ts
    );
    // remove this stake information from the subdao
    sub_dao.vehnt_delegated = sub_dao.vehnt_delegated.saturating_sub(
      u128::from(vehnt_at_curr_ts)
        .checked_mul(FALL_RATE_FACTOR)
        .unwrap(),
    );

    sub_dao.vehnt_fall_rate = sub_dao
      .vehnt_fall_rate
      .checked_sub(if curr_ts >= position.genesis_end {
        post_genesis_end_fall_rate
      } else {
        pre_genesis_end_fall_rate
      })
      .unwrap();
  }
  // Unless the position was staked before this epoch, remove it.
  if current_epoch(delegated_position.start_ts) < curr_epoch {
    let vehnt_at_start = position.voting_power(
      voting_mint_config,
      ctx.accounts.sub_dao_epoch_info.start_ts(),
    )?;
    msg!(
      "Removing {} vehnt from this epoch for this subdao, which currently has {} vehnt",
      vehnt_at_start,
      ctx.accounts.sub_dao_epoch_info.vehnt_at_epoch_start
    );
    ctx.accounts.sub_dao_epoch_info.vehnt_at_epoch_start = ctx
      .accounts
      .sub_dao_epoch_info
      .vehnt_at_epoch_start
      .saturating_sub(vehnt_at_start)
  }

  ctx.accounts.sub_dao_epoch_info.sub_dao = ctx.accounts.sub_dao.key();
  ctx.accounts.sub_dao_epoch_info.bump_seed = *ctx.bumps.get("sub_dao_epoch_info").unwrap();
  ctx.accounts.sub_dao_epoch_info.initialized = true;

  Ok(())
}
