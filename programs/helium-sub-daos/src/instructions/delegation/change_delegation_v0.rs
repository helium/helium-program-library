use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};
use modular_governance::nft_proxy::accounts::ProxyConfigV0;
use voter_stake_registry::{
  state::{LockupKind, PositionV0, Registrar},
  VoterStakeRegistry,
};

use super::{
  close_delegation_v0,
  close_delegation_v0::{get_closing_epoch_bytes, get_genesis_end_epoch_bytes},
  delegate_v0::{
    self, get_closing_epoch_bytes as get_closing_epoch_bytes_delegate,
    get_genesis_end_epoch_bytes as get_genesis_end_epoch_bytes_delegate,
  },
  CloseDelegationAccounts, DelegationAccounts, DelegationBumps,
};
use crate::{current_epoch, error::ErrorCode, get_sub_dao_epoch_info_seed, state::*};

const HNT_EPOCH: u64 = 20117;

#[derive(Accounts)]
pub struct ChangeDelegationV0<'info> {
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

  // Old SubDAO accounts for closing
  #[account(
    mut,
    has_one = dao,
    constraint = old_sub_dao.key() == delegated_position.sub_dao @ ErrorCode::InvalidChangeDelegationSubDao
  )]
  pub old_sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(
    init_if_needed,
    payer = payer,
    space = SubDaoEpochInfoV0::SIZE,
    seeds = ["sub_dao_epoch_info".as_bytes(), old_sub_dao.key().as_ref(), &get_sub_dao_epoch_info_seed(&registrar)],
    bump,
  )]
  pub old_sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(
    mut,
    seeds = ["sub_dao_epoch_info".as_bytes(), old_sub_dao.key().as_ref(), &get_closing_epoch_bytes(&position, &delegated_position)],
    bump = old_closing_time_sub_dao_epoch_info.bump_seed,
  )]
  pub old_closing_time_sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(
    mut,
    seeds = [
      "sub_dao_epoch_info".as_bytes(), 
      old_sub_dao.key().as_ref(),
      &get_genesis_end_epoch_bytes(&position, &registrar, &delegated_position)
    ],
    bump = old_genesis_end_sub_dao_epoch_info.bump_seed,
  )]
  pub old_genesis_end_sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,

  // New SubDAO accounts for delegating
  #[account(
    mut,
    has_one = dao,
    constraint = sub_dao.key() != old_sub_dao.key() @ ErrorCode::InvalidChangeDelegationSubDao
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
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &get_closing_epoch_bytes_delegate(&position, &proxy_config, &registrar)],
    bump,
  )]
  pub closing_time_sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(
    mut,
    seeds = [
      "sub_dao_epoch_info".as_bytes(), 
      sub_dao.key().as_ref(),
      &get_genesis_end_epoch_bytes_delegate(&position, &proxy_config, &registrar)
    ],
    bump,
  )]
  /// CHECK: Verified when needed in the inner instr
  pub genesis_end_sub_dao_epoch_info: UncheckedAccount<'info>,

  #[account(
    mut,
    seeds = ["delegated_position".as_bytes(), position.key().as_ref()],
    bump = delegated_position.bump_seed,
    constraint = delegated_position.last_claimed_epoch >= HNT_EPOCH @ ErrorCode::ClaimBeforeChangeDelegation,
    constraint = delegated_position.expiration_ts > registrar.clock_unix_timestamp() @ ErrorCode::CannotExtendExpiredPosition
  )]
  pub delegated_position: Box<Account<'info, DelegatedPositionV0>>,

  pub vsr_program: Program<'info, VoterStakeRegistry>,
  pub system_program: Program<'info, System>,
  pub proxy_config: Account<'info, ProxyConfigV0>,
}

pub fn handler(ctx: Context<ChangeDelegationV0>) -> Result<()> {
  // Save the rewards state from the old delegated position
  let old_last_claimed_epoch = ctx.accounts.delegated_position.last_claimed_epoch;
  let old_claimed_epochs_bitmap = ctx.accounts.delegated_position.claimed_epochs_bitmap;
  let old_start_ts = ctx.accounts.delegated_position.start_ts;
  let curr_ts = ctx.accounts.registrar.clock_unix_timestamp();
  let curr_epoch = current_epoch(curr_ts);
  let to_claim_to_epoch = if ctx.accounts.position.lockup.end_ts < curr_ts
    && ctx.accounts.position.lockup.kind == LockupKind::Cliff
  {
    current_epoch(ctx.accounts.position.lockup.end_ts) - 1
  } else {
    curr_epoch - 1
  };
  ctx.accounts.delegated_position.last_claimed_epoch = to_claim_to_epoch;

  // Close the old delegation
  close_delegation_v0::raw_handler(
    &mut CloseDelegationAccounts {
      position: &mut ctx.accounts.position,
      registrar: &mut ctx.accounts.registrar,
      sub_dao: &mut ctx.accounts.old_sub_dao,
      delegated_position: &mut ctx.accounts.delegated_position,
      sub_dao_epoch_info: &mut ctx.accounts.old_sub_dao_epoch_info,
      closing_time_sub_dao_epoch_info: &mut ctx.accounts.old_closing_time_sub_dao_epoch_info,
      genesis_end_sub_dao_epoch_info: &mut ctx.accounts.old_genesis_end_sub_dao_epoch_info,
    },
    ctx.bumps.sub_dao_epoch_info,
  )?;

  let delegated_position = &mut ctx.accounts.delegated_position;
  let delegated_position_bump = delegated_position.bump_seed;
  // Create the new delegation
  delegate_v0::raw_handler(
    &mut DelegationAccounts {
      payer: &mut ctx.accounts.payer,
      mint: &mut ctx.accounts.mint,
      position: &mut ctx.accounts.position,
      registrar: &mut ctx.accounts.registrar,
      sub_dao: &mut ctx.accounts.sub_dao,
      delegated_position,
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
      delegated_position: delegated_position_bump,
    },
  )?;

  // Restore the rewards state in the new delegated position
  ctx.accounts.delegated_position.start_ts = old_start_ts;
  ctx.accounts.delegated_position.last_claimed_epoch = old_last_claimed_epoch;
  ctx.accounts.delegated_position.claimed_epochs_bitmap = old_claimed_epochs_bitmap;

  Ok(())
}
