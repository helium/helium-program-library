use std::{cmp::min, str::FromStr};

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};
use modular_governance::nft_proxy::accounts::ProxyConfigV0;
use shared_utils::try_from;
use voter_stake_registry::state::{PositionV0, Registrar};

use crate::{
  caclulate_vhnt_info, current_epoch, error::ErrorCode, id, DaoV0, DelegatedPositionV0,
  SubDaoEpochInfoV0, SubDaoV0,
};

pub fn get_genesis_end_epoch_bytes(
  position: &PositionV0,
  registrar: &Registrar,
  proxy_config: &ProxyConfigV0,
) -> [u8; 8] {
  current_epoch(
    // If the genesis piece is no longer in effect (has been purged),
    // no need to pass an extra account here. Just pass the closing time sdei and
    // do not change it.
    if position.genesis_end <= registrar.clock_unix_timestamp() {
      min(
        proxy_config
          .get_current_season(registrar.clock_unix_timestamp())
          .unwrap()
          .end,
        position.lockup.effective_end_ts(),
      )
    } else {
      position.genesis_end
    },
  )
  .to_le_bytes()
}

fn get_old_closing_epoch_bytes(
  position: &PositionV0,
  delegated_position: &DelegatedPositionV0,
) -> [u8; 8] {
  current_epoch(if delegated_position.expiration_ts == 0 {
    position.lockup.effective_end_ts()
  } else {
    min(
      position.lockup.effective_end_ts(),
      delegated_position.expiration_ts,
    )
  })
  .to_le_bytes()
}

fn get_new_closing_epoch_bytes(
  position: &PositionV0,
  proxy_config: &ProxyConfigV0,
  registrar: &Registrar,
) -> [u8; 8] {
  current_epoch(min(
    proxy_config
      .get_current_season(registrar.clock_unix_timestamp())
      .unwrap()
      .end,
    position.lockup.effective_end_ts(),
  ))
  .to_le_bytes()
}

#[derive(Accounts)]
pub struct ExtendExpirationTsV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    mut,
    has_one = mint,
  )]
  pub position: Account<'info, PositionV0>,
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    token::mint = mint,
    constraint = position_token_account.amount > 0
  )]
  pub position_token_account: Box<Account<'info, TokenAccount>>,
  #[account(
    constraint = authority.key() == position_token_account.owner || authority.key() == Pubkey::from_str("hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW").unwrap()
  )]
  pub authority: Signer<'info>,
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
    constraint = delegated_position.expiration_ts > registrar.clock_unix_timestamp() @ ErrorCode::CannotExtendExpiredPosition
  )]
  pub delegated_position: Account<'info, DelegatedPositionV0>,
  #[account(
    mut,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &get_old_closing_epoch_bytes(&position, &delegated_position)],
    bump,
  )]
  pub old_closing_time_sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(
    init_if_needed,
    payer = payer,
    space = SubDaoEpochInfoV0::SIZE,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &get_new_closing_epoch_bytes(&position, &proxy_config, &registrar)],
    bump,
  )]
  pub closing_time_sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(
    mut,
    seeds = [
      "sub_dao_epoch_info".as_bytes(), 
      sub_dao.key().as_ref(),
      &get_genesis_end_epoch_bytes(&position, &registrar, &proxy_config)
    ],

    bump,
  )]
  /// CHECK: Verified when needed in the inner instr
  pub genesis_end_sub_dao_epoch_info: UncheckedAccount<'info>,
  pub proxy_config: Box<Account<'info, ProxyConfigV0>>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ExtendExpirationTsV0>) -> Result<()> {
  let position = &mut ctx.accounts.position;
  let registrar = &ctx.accounts.registrar;
  let voting_mint_config = &registrar.voting_mints[position.voting_mint_config_idx as usize];
  let expiration_ts = min(
    ctx
      .accounts
      .proxy_config
      .get_current_season(registrar.clock_unix_timestamp())
      .unwrap()
      .end,
    position.lockup.effective_end_ts(),
  );
  let epoch = current_epoch(registrar.clock_unix_timestamp());

  // Calculate vehnt info once
  msg!(
    "Calculating vehnt info for old expiration ts {}",
    ctx.accounts.delegated_position.expiration_ts
  );
  let vehnt_info_old = caclulate_vhnt_info(
    ctx.accounts.delegated_position.start_ts,
    position,
    voting_mint_config,
    ctx.accounts.delegated_position.expiration_ts,
  )?;
  ctx.accounts.delegated_position.expiration_ts = expiration_ts;
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
      ctx.bumps.closing_time_sub_dao_epoch_info;
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

  let genesis_end_is_closing = ctx.accounts.genesis_end_sub_dao_epoch_info.key()
    == ctx.accounts.closing_time_sub_dao_epoch_info.key();
  let genesis_end_is_old_closing = ctx.accounts.genesis_end_sub_dao_epoch_info.key()
    == ctx.accounts.old_closing_time_sub_dao_epoch_info.key();
  if ctx.accounts.genesis_end_sub_dao_epoch_info.data_len() > 0 {
    let mut parsed: Account<SubDaoEpochInfoV0>;
    let genesis_end_sdei: &mut Account<SubDaoEpochInfoV0> = if genesis_end_is_closing {
      &mut ctx.accounts.closing_time_sub_dao_epoch_info
    } else if genesis_end_is_old_closing {
      &mut ctx.accounts.old_closing_time_sub_dao_epoch_info
    } else {
      parsed = try_from!(
        Account<SubDaoEpochInfoV0>,
        &ctx.accounts.genesis_end_sub_dao_epoch_info
      )?;
      &mut parsed
    };
    if genesis_end_sdei.epoch > epoch && position.genesis_end > registrar.clock_unix_timestamp() {
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
  }

  Ok(())
}
