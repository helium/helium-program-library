use std::{cmp::min, str::FromStr};

use anchor_lang::prelude::*;
use nft_proxy::ProxyConfigV0;
use voter_stake_registry::state::{PositionV0, Registrar};

use crate::{
  caclulate_vhnt_info, current_epoch, id, DaoV0, DelegatedPositionV0, SubDaoEpochInfoV0, SubDaoV0,
  TESTING,
};

#[derive(Accounts)]
pub struct AddExpirationTs<'info> {
  #[account(
    mut,
    address = if TESTING {
      payer.key()
    } else {
      Pubkey::from_str("hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW").unwrap()
    }
  )]
  pub payer: Signer<'info>,
  #[account(mut)]
  pub position: Account<'info, PositionV0>,
  #[account(
    has_one = proxy_config
  )]
  pub registrar: Box<Account<'info, Registrar>>,
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
    mut,
    seeds = ["delegated_position".as_bytes(), position.key().as_ref()],
    has_one = position,
    has_one = sub_dao,
    bump = delegated_position.bump_seed,
    constraint = TESTING || delegated_position.expiration_ts == 0
  )]
  pub delegated_position: Account<'info, DelegatedPositionV0>,
  #[account(
    mut,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &current_epoch(
        position.lockup.end_ts
    ).to_le_bytes()],
    bump,
  )]
  pub old_closing_time_sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(
    init_if_needed,
    payer = payer,
    space = SubDaoEpochInfoV0::SIZE,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &current_epoch(
        min(proxy_config.get_current_season(registrar.clock_unix_timestamp()).unwrap().end, position.lockup.end_ts)
    ).to_le_bytes()],
    bump,
  )]
  pub closing_time_sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(
    mut,
    seeds = [
      "sub_dao_epoch_info".as_bytes(), 
      sub_dao.key().as_ref(),
      &current_epoch(
        // If the genesis piece is no longer in effect (has been purged), 
        // no need to pass an extra account here. Just pass the closing time sdei and
        // do not change it.
        if position.genesis_end <= registrar.clock_unix_timestamp() {
          position.lockup.end_ts
        } else {
          position.genesis_end
        }
      ).to_le_bytes()
    ],
    bump = genesis_end_sub_dao_epoch_info.bump_seed,
  )]
  pub genesis_end_sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  pub proxy_config: Box<Account<'info, ProxyConfigV0>>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AddExpirationTs>) -> Result<()> {
  let position = &mut ctx.accounts.position;
  let registrar = &ctx.accounts.registrar;
  let voting_mint_config = &registrar.voting_mints[position.voting_mint_config_idx as usize];
  let expiration_ts = ctx
    .accounts
    .proxy_config
    .get_current_season(registrar.clock_unix_timestamp())
    .unwrap()
    .end;
  ctx.accounts.delegated_position.expiration_ts = expiration_ts;
  let epoch = current_epoch(registrar.clock_unix_timestamp());

  // Calculate vehnt info once
  let vehnt_info_old = caclulate_vhnt_info(
    ctx.accounts.delegated_position.start_ts,
    position,
    voting_mint_config,
    i64::MAX,
  )?;
  let vehnt_info_new = caclulate_vhnt_info(
    ctx.accounts.delegated_position.start_ts,
    position,
    voting_mint_config,
    expiration_ts,
  )?;

  // Store the account keys for comparison
  let old_closing_time_key = ctx.accounts.old_closing_time_sub_dao_epoch_info.key();
  let closing_time_key = ctx.accounts.closing_time_sub_dao_epoch_info.key();

  // Move correction from old_closing_time_sdei to closing_time_sdei if needed
  if old_closing_time_key != closing_time_key {
    let old_closing_time_sdei = &mut ctx.accounts.old_closing_time_sub_dao_epoch_info;
    if old_closing_time_sdei.epoch > epoch {
      msg!(
        "Subtracting vehnt info from old closing time sdei {:?}",
        vehnt_info_old
      );
      old_closing_time_sdei.vehnt_in_closing_positions = old_closing_time_sdei
        .vehnt_in_closing_positions
        .checked_sub(vehnt_info_old.end_vehnt_correction)
        .unwrap();
      old_closing_time_sdei.fall_rates_from_closing_positions = old_closing_time_sdei
        .fall_rates_from_closing_positions
        .checked_sub(vehnt_info_old.end_fall_rate_correction)
        .unwrap();
      msg!(
        "Post subtraction closing time sdei {} {}",
        old_closing_time_sdei.vehnt_in_closing_positions,
        old_closing_time_sdei.fall_rates_from_closing_positions
      );
      old_closing_time_sdei.exit(&id())?;
    }

    // Update closing_time_sdei
    ctx.accounts.closing_time_sub_dao_epoch_info.sub_dao = ctx.accounts.sub_dao.key();
    ctx.accounts.closing_time_sub_dao_epoch_info.bump_seed =
      *ctx.bumps.get("closing_time_sub_dao_epoch_info").unwrap();
    ctx.accounts.closing_time_sub_dao_epoch_info.epoch = current_epoch(expiration_ts);
    let closing_time_sdei = &mut ctx.accounts.closing_time_sub_dao_epoch_info;
    if closing_time_sdei.epoch > epoch {
      msg!(
        "Adding vehnt info to closing time sdei {:?}",
        vehnt_info_new,
      );
      closing_time_sdei.vehnt_in_closing_positions = closing_time_sdei
        .vehnt_in_closing_positions
        .checked_add(vehnt_info_new.end_vehnt_correction)
        .unwrap();
      closing_time_sdei.fall_rates_from_closing_positions = closing_time_sdei
        .fall_rates_from_closing_positions
        .checked_add(vehnt_info_new.end_fall_rate_correction)
        .unwrap();
      msg!(
        "Post addition closing time sdei {} {}",
        closing_time_sdei.vehnt_in_closing_positions,
        closing_time_sdei.fall_rates_from_closing_positions
      );
    }

    closing_time_sdei.exit(&id())?;
  }

  // Always update genesis_end_sdei
  ctx.accounts.genesis_end_sub_dao_epoch_info.reload()?;
  let genesis_end_sdei = &mut ctx.accounts.genesis_end_sub_dao_epoch_info;
  if genesis_end_sdei.epoch > epoch {
    msg!(
      "Subtracting vehnt info from genesis end sdei {:?}",
      vehnt_info_old
    );
    genesis_end_sdei.vehnt_in_closing_positions = genesis_end_sdei
      .vehnt_in_closing_positions
      .checked_sub(vehnt_info_old.genesis_end_vehnt_correction)
      .unwrap();
    genesis_end_sdei.fall_rates_from_closing_positions = genesis_end_sdei
      .fall_rates_from_closing_positions
      .checked_sub(vehnt_info_old.genesis_end_fall_rate_correction)
      .unwrap();
    msg!(
      "Post subtraction genesis end sdei {} {}",
      genesis_end_sdei.vehnt_in_closing_positions,
      genesis_end_sdei.fall_rates_from_closing_positions
    );

    genesis_end_sdei.vehnt_in_closing_positions = genesis_end_sdei
      .vehnt_in_closing_positions
      .checked_add(vehnt_info_new.genesis_end_vehnt_correction)
      .unwrap();
    genesis_end_sdei.fall_rates_from_closing_positions = genesis_end_sdei
      .fall_rates_from_closing_positions
      .checked_add(vehnt_info_new.genesis_end_fall_rate_correction)
      .unwrap();
    msg!(
      "Post addition genesis end sdei {} {}",
      genesis_end_sdei.vehnt_in_closing_positions,
      genesis_end_sdei.fall_rates_from_closing_positions
    );

    genesis_end_sdei.exit(&id())?;
  }

  Ok(())
}