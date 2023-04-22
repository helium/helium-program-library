use crate::{
  caclulate_vhnt_info, current_epoch, id, state::*, update_subdao_vehnt, PrecisePosition,
  VehntInfo, EPOCH_LENGTH,
};
use anchor_lang::prelude::*;

use voter_stake_registry::{
  cpi::accounts::RepairPositionV0,
  cpi::repair_position_v0,
  state::{LockupKind, PositionV0, Registrar},
  VoterStakeRegistry,
};

#[derive(Accounts)]
pub struct RepairDelegationV0<'info> {
  #[account(mut)]
  pub authority: Signer<'info>,
  #[account(
    mut,
    has_one = registrar,
  )]
  pub position: Box<Account<'info, PositionV0>>,
  pub registrar: Box<Account<'info, Registrar>>,
  #[account(
    has_one = registrar,
    // has_one = authority
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    mut,
    has_one = dao,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,

  #[account(
    mut,
    seeds = ["delegated_position".as_bytes(), position.key().as_ref()],
    has_one = position,
    has_one = sub_dao,
    bump
  )]
  pub delegated_position: Account<'info, DelegatedPositionV0>,
  #[account(
    mut,
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

pub fn handler(ctx: Context<RepairDelegationV0>) -> Result<()> {
  // load the vehnt information
  let position = &mut ctx.accounts.position;
  let registrar = &ctx.accounts.registrar;
  let voting_mint_config = &registrar.voting_mints[position.voting_mint_config_idx as usize];
  let curr_ts = registrar.clock_unix_timestamp();
  let vehnt_at_curr_ts = position.voting_power_precise(voting_mint_config, curr_ts)?;
  let vehnt_info = caclulate_vhnt_info(
    ctx.accounts.delegated_position.start_ts,
    position,
    voting_mint_config,
  )?;

  // Undelegate logic without actually unstaking
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
  msg!("Curr vehnt: {:?}", vehnt_at_curr_ts);
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
    .saturating_sub(genesis_end_vehnt_correction);

  if end_and_genesis_same {
    // Ensure ordering of exit is correct
    // If we don't do this, genesis end could exit last and overwrite the values
    genesis_end_sub_dao_epoch_info.exit(&id())?;
    ctx.accounts.genesis_end_sub_dao_epoch_info.reload()?;
  }

  // This position has introduced an incorrect fall rate for its duration.
  // Add the fall rate from this position back to the subdao vehnt to correct.
  if position.lockup.total_seconds() > u64::try_from(EPOCH_LENGTH * 365 * 4).unwrap()
    && position.lockup.kind == LockupKind::Cliff
  {
    let correction_vehnt = u128::try_from(curr_ts - ctx.accounts.delegated_position.start_ts)
      .unwrap()
      .checked_mul(pre_genesis_end_fall_rate)
      .unwrap();
    msg!("Correcting vehnt by {}", correction_vehnt);
    sub_dao.vehnt_delegated = sub_dao
      .vehnt_delegated
      .checked_add(correction_vehnt)
      .unwrap();
  }

  if position.lockup.end_ts >= ctx.accounts.sub_dao_epoch_info.end_ts()
    || position.lockup.kind == LockupKind::Constant
  {
    msg!(
      "Current vehnt {}, removing {} from the subdao",
      sub_dao.vehnt_delegated,
      vehnt_at_curr_ts
    );
    // remove this stake information from the subdao
    sub_dao.vehnt_delegated = sub_dao.vehnt_delegated.saturating_sub(vehnt_at_curr_ts);

    sub_dao.vehnt_fall_rate = sub_dao
      .vehnt_fall_rate
      .checked_sub(if curr_ts >= position.genesis_end {
        post_genesis_end_fall_rate
      } else {
        pre_genesis_end_fall_rate
      })
      .unwrap();
  }

  // Repair position on vsr side
  repair_position_v0(CpiContext::new_with_signer(
    ctx.accounts.vsr_program.to_account_info(),
    RepairPositionV0 {
      registrar: ctx.accounts.registrar.to_account_info(),
      position_update_authority: ctx.accounts.dao.to_account_info(),
      position: position.clone().to_account_info(),
    },
    &[&[
      b"dao",
      ctx.accounts.dao.hnt_mint.key().as_ref(),
      &[ctx.accounts.dao.bump_seed],
    ]],
  ))?;

  position.reload()?;

  // Re-delegate logic
  let vehnt_info = caclulate_vhnt_info(curr_ts, position, voting_mint_config)?;
  let VehntInfo {
    has_genesis,
    vehnt_at_curr_ts,
    pre_genesis_end_fall_rate,
    post_genesis_end_fall_rate,
    genesis_end_fall_rate_correction,
    genesis_end_vehnt_correction,
    end_fall_rate_correction,
    end_vehnt_correction,
  } = vehnt_info;

  msg!("Vehnt calculations: {:?}", vehnt_info);

  sub_dao.vehnt_delegated = sub_dao
    .vehnt_delegated
    .checked_add(vehnt_at_curr_ts)
    .unwrap();
  sub_dao.vehnt_fall_rate = if has_genesis {
    sub_dao
      .vehnt_fall_rate
      .checked_add(pre_genesis_end_fall_rate)
      .unwrap()
  } else {
    sub_dao
      .vehnt_fall_rate
      .checked_add(post_genesis_end_fall_rate)
      .unwrap()
  };

  ctx
    .accounts
    .closing_time_sub_dao_epoch_info
    .fall_rates_from_closing_positions = ctx
    .accounts
    .closing_time_sub_dao_epoch_info
    .fall_rates_from_closing_positions
    .checked_add(end_fall_rate_correction)
    .unwrap();

  ctx
    .accounts
    .closing_time_sub_dao_epoch_info
    .vehnt_in_closing_positions = ctx
    .accounts
    .closing_time_sub_dao_epoch_info
    .vehnt_in_closing_positions
    .checked_add(end_vehnt_correction)
    .unwrap();

  if genesis_end_fall_rate_correction > 0 || genesis_end_vehnt_correction > 0 {
    // closing can be the same account as genesis end. Make sure to use the proper account
    let mut parsed: Account<SubDaoEpochInfoV0>;
    let genesis_end_sub_dao_epoch_info: &mut Account<SubDaoEpochInfoV0> =
      if ctx.accounts.genesis_end_sub_dao_epoch_info.key()
        == ctx.accounts.closing_time_sub_dao_epoch_info.key()
      {
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

    genesis_end_sub_dao_epoch_info.fall_rates_from_closing_positions =
      genesis_end_sub_dao_epoch_info
        .fall_rates_from_closing_positions
        .checked_add(genesis_end_fall_rate_correction)
        .unwrap();

    genesis_end_sub_dao_epoch_info.vehnt_in_closing_positions = genesis_end_sub_dao_epoch_info
      .vehnt_in_closing_positions
      .checked_add(genesis_end_vehnt_correction)
      .unwrap();

    genesis_end_sub_dao_epoch_info.exit(&id())?;
  }

  Ok(())
}
