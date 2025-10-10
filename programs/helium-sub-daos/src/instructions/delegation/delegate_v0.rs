use std::cmp::min;

use anchor_lang::{prelude::*, Discriminator};
use anchor_spl::token::{Mint, TokenAccount};
use modular_governance::nft_proxy::accounts::ProxyConfigV0;
use shared_utils::try_from;
use voter_stake_registry::{
  state::{LockupKind, PositionV0, Registrar},
  VoterStakeRegistry,
};

use self::borsh::BorshSerialize;
use super::{DelegationAccounts, DelegationBumps};
use crate::{
  create_account::{create_and_serialize_account_signed, AccountMaxSize},
  current_epoch,
  error::ErrorCode,
  id,
  state::*,
  utils::*,
};

pub fn get_closing_epoch_bytes(
  position: &PositionV0,
  proxy_config: &ProxyConfigV0,
  registrar: &Registrar,
) -> [u8; 8] {
  current_epoch(min(
    position.lockup.effective_end_ts(),
    proxy_config
      .get_current_season(registrar.clock_unix_timestamp())
      .unwrap()
      .end,
  ))
  .to_le_bytes()
}

pub fn get_genesis_end_epoch_bytes(
  position: &PositionV0,
  proxy_config: &ProxyConfigV0,
  registrar: &Registrar,
) -> [u8; 8] {
  current_epoch(
    // Avoid passing an extra account if the end is 0 (no genesis on this position).
    // Pass instead closing time epoch info, txn account deduplication will reduce the overall tx size
    if position.genesis_end <= registrar.clock_unix_timestamp() {
      min(
        position.lockup.effective_end_ts(),
        proxy_config
          .get_current_season(registrar.clock_unix_timestamp())
          .unwrap()
          .end,
      )
    } else {
      position.genesis_end
    },
  )
  .to_le_bytes()
}

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
    constraint = position.lockup.kind == LockupKind::Constant || position.lockup.end_ts > registrar.clock_unix_timestamp()
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
    init_if_needed,
    payer = payer,
    space = SubDaoEpochInfoV0::SIZE,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &get_sub_dao_epoch_info_seed(&registrar)],
    bump,
    constraint = sub_dao_epoch_info.key() != closing_time_sub_dao_epoch_info.key() @ ErrorCode::NoDelegateEndingPosition
  )]
  pub sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(
    init_if_needed,
    payer = payer,
    space = SubDaoEpochInfoV0::SIZE,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &get_closing_epoch_bytes(&position, &proxy_config, &registrar)],
    bump,
  )]
  pub closing_time_sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(
    mut,
    seeds = [
      "sub_dao_epoch_info".as_bytes(), 
      sub_dao.key().as_ref(),
      &get_genesis_end_epoch_bytes(&position, &proxy_config, &registrar)
    ],
    bump,
  )]
  /// CHECK: Verified when needed in the inner instr
  pub genesis_end_sub_dao_epoch_info: UncheckedAccount<'info>,

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
  pub proxy_config: Account<'info, ProxyConfigV0>,
}

pub struct SubDaoEpochInfoV0WithDescriminator {
  pub sub_dao_epoch_info: SubDaoEpochInfoV0,
}

impl BorshSerialize for SubDaoEpochInfoV0WithDescriminator {
  fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
    writer.write_all(SubDaoEpochInfoV0::DISCRIMINATOR)?;
    self.sub_dao_epoch_info.serialize(writer)
  }
}

impl AccountMaxSize for SubDaoEpochInfoV0WithDescriminator {
  fn get_max_size(&self) -> Option<usize> {
    Some(SubDaoEpochInfoV0::SIZE)
  }
}

pub fn raw_handler(accounts: &mut DelegationAccounts, bumps: &DelegationBumps) -> Result<()> {
  // load the vehnt information
  let position = &mut accounts.position;
  let registrar = &accounts.registrar;
  let voting_mint_config = &registrar.voting_mints[position.voting_mint_config_idx as usize];
  let curr_ts = registrar.clock_unix_timestamp();

  let expiration_ts = min(
    accounts
      .proxy_config
      .get_current_season(curr_ts)
      .unwrap()
      .end,
    position.lockup.effective_end_ts(),
  );

  let vehnt_info = caclulate_vhnt_info(curr_ts, position, voting_mint_config, expiration_ts)?;
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

  msg!(
    "Vehnt calculations: {:?}, expiration ts {}",
    vehnt_info,
    expiration_ts
  );

  let curr_epoch = current_epoch(curr_ts);

  let sub_dao = &mut accounts.sub_dao;
  let delegated_position = &mut accounts.delegated_position;

  // Update the veHnt at start of epoch
  accounts.sub_dao_epoch_info.epoch = current_epoch(curr_ts);
  update_subdao_vehnt(sub_dao, accounts.sub_dao_epoch_info, curr_ts)?;

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

  accounts
    .closing_time_sub_dao_epoch_info
    .fall_rates_from_closing_positions = accounts
    .closing_time_sub_dao_epoch_info
    .fall_rates_from_closing_positions
    .checked_add(end_fall_rate_correction)
    .unwrap();

  accounts
    .closing_time_sub_dao_epoch_info
    .vehnt_in_closing_positions = accounts
    .closing_time_sub_dao_epoch_info
    .vehnt_in_closing_positions
    .checked_add(end_vehnt_correction)
    .unwrap();
  accounts.closing_time_sub_dao_epoch_info.sub_dao = sub_dao.key();
  accounts.closing_time_sub_dao_epoch_info.epoch = current_epoch(expiration_ts);
  accounts.closing_time_sub_dao_epoch_info.bump_seed = bumps.closing_time_sub_dao_epoch_info;

  let mut parsed: Account<SubDaoEpochInfoV0>;
  let genesis_end_is_closing =
    accounts.genesis_end_sub_dao_epoch_info.key() == accounts.closing_time_sub_dao_epoch_info.key();
  // If the end account doesn't exist, init it. Otherwise just set the correcitons
  if !genesis_end_is_closing && accounts.genesis_end_sub_dao_epoch_info.data_len() == 0 {
    msg!("Genesis end doesn't exist, initting");
    let genesis_end_epoch = current_epoch(position.genesis_end);
    // Anchor doesn't natively support dynamic account creation using remaining_accounts
    // and we have to take it on the manual drive
    create_and_serialize_account_signed(
      &accounts.payer.to_account_info(),
      &accounts.genesis_end_sub_dao_epoch_info.to_account_info(),
      &SubDaoEpochInfoV0WithDescriminator {
        sub_dao_epoch_info: SubDaoEpochInfoV0 {
          epoch: genesis_end_epoch,
          bump_seed: bumps.genesis_end_sub_dao_epoch_info,
          sub_dao: sub_dao.key(),
          previous_percentage: 0,
          dc_burned: 0,
          vehnt_at_epoch_start: 0,
          vehnt_in_closing_positions: genesis_end_vehnt_correction,
          fall_rates_from_closing_positions: genesis_end_fall_rate_correction,
          delegation_rewards_issued: 0,
          utility_score: None,
          rewards_issued_at: None,
          initialized: false,
          dc_onboarding_fees_paid: 0,
          hnt_rewards_issued: 0,
        },
      },
      &[
        "sub_dao_epoch_info".as_bytes(),
        sub_dao.key().as_ref(),
        &genesis_end_epoch.to_le_bytes(),
      ],
      &id(),
      &accounts.system_program.to_account_info(),
      &Rent::get()?,
      0,
    )?;
  } else {
    // closing can be the same account as genesis end. Make sure to use the proper account
    let genesis_end_sub_dao_epoch_info: &mut Account<SubDaoEpochInfoV0> = if genesis_end_is_closing
    {
      accounts.closing_time_sub_dao_epoch_info
    } else {
      parsed = try_from!(
        Account<SubDaoEpochInfoV0>,
        &accounts.genesis_end_sub_dao_epoch_info
      )?;
      &mut parsed
    };

    // EDGE CASE: The genesis end could be this epoch. Do not override what was done with update_subdao_vehnt
    if genesis_end_sub_dao_epoch_info.key() == accounts.sub_dao_epoch_info.key() {
      genesis_end_sub_dao_epoch_info.vehnt_at_epoch_start =
        accounts.sub_dao_epoch_info.vehnt_at_epoch_start;
      genesis_end_sub_dao_epoch_info.dc_onboarding_fees_paid =
        accounts.sub_dao_epoch_info.dc_onboarding_fees_paid;
      genesis_end_sub_dao_epoch_info.fall_rates_from_closing_positions = accounts
        .sub_dao_epoch_info
        .fall_rates_from_closing_positions;
      genesis_end_sub_dao_epoch_info.vehnt_in_closing_positions =
        accounts.sub_dao_epoch_info.vehnt_in_closing_positions;
    } else {
      genesis_end_sub_dao_epoch_info.fall_rates_from_closing_positions =
        genesis_end_sub_dao_epoch_info
          .fall_rates_from_closing_positions
          .checked_add(genesis_end_fall_rate_correction)
          .unwrap();

      genesis_end_sub_dao_epoch_info.vehnt_in_closing_positions = genesis_end_sub_dao_epoch_info
        .vehnt_in_closing_positions
        .checked_add(genesis_end_vehnt_correction)
        .unwrap();
    }

    genesis_end_sub_dao_epoch_info.exit(&id())?;
  }

  delegated_position.purged = false;
  delegated_position.start_ts = curr_ts;
  delegated_position.hnt_amount = position.amount_deposited_native;
  delegated_position.last_claimed_epoch = curr_epoch;
  delegated_position.sub_dao = accounts.sub_dao.key();
  delegated_position.mint = accounts.mint.key();
  delegated_position.position = accounts.position.key();
  delegated_position.bump_seed = bumps.delegated_position;
  delegated_position.expiration_ts = expiration_ts;

  accounts.sub_dao_epoch_info.sub_dao = accounts.sub_dao.key();
  accounts.sub_dao_epoch_info.bump_seed = bumps.sub_dao_epoch_info;
  accounts.sub_dao_epoch_info.initialized = true;

  Ok(())
}

pub fn handler(ctx: Context<DelegateV0>) -> Result<()> {
  raw_handler(
    &mut DelegationAccounts {
      payer: &mut ctx.accounts.payer,
      mint: &mut ctx.accounts.mint,
      position: &mut ctx.accounts.position,
      registrar: &mut ctx.accounts.registrar,
      sub_dao: &mut ctx.accounts.sub_dao,
      delegated_position: &mut ctx.accounts.delegated_position,
      sub_dao_epoch_info: &mut ctx.accounts.sub_dao_epoch_info,
      closing_time_sub_dao_epoch_info: &mut ctx.accounts.closing_time_sub_dao_epoch_info,
      genesis_end_sub_dao_epoch_info: &ctx.accounts.genesis_end_sub_dao_epoch_info,
      system_program: &mut ctx.accounts.system_program,
      proxy_config: &mut ctx.accounts.proxy_config,
    },
    &DelegationBumps {
      sub_dao_epoch_info: ctx.bumps.sub_dao_epoch_info,
      closing_time_sub_dao_epoch_info: ctx.bumps.closing_time_sub_dao_epoch_info,
      genesis_end_sub_dao_epoch_info: ctx.bumps.genesis_end_sub_dao_epoch_info,
      delegated_position: ctx.bumps.delegated_position,
    },
  )?;
  Ok(())
}
