use crate::{current_epoch, state::*, update_subdao_vehnt};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

use voter_stake_registry::state::{LockupKind, PositionV0, Registrar};

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
  pub registrar: AccountLoader<'info, Registrar>,
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
    bump
  )]
  pub delegated_position: Account<'info, DelegatedPositionV0>,
  #[account(
    init_if_needed,
    payer = payer,
    space = 60 + 8 + std::mem::size_of::<SubDaoEpochInfoV0>(),
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &current_epoch(registrar.load()?.clock_unix_timestamp()).to_le_bytes()],
    bump,
  )]
  pub sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,

  ///CHECK: constraints
  #[account(address = voter_stake_registry::ID)]
  pub vsr_program: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<CloseDelegationV0>) -> Result<()> {
  // load the vehnt information
  let position = &mut ctx.accounts.position;
  let registrar = &ctx.accounts.registrar.load()?;
  let voting_mint_config = &registrar.voting_mints[position.voting_mint_config_idx as usize];
  let curr_ts = registrar.clock_unix_timestamp();
  let available_vehnt = position.voting_power(voting_mint_config, curr_ts)?;

  // don't allow unstake without claiming available rewards
  let curr_epoch = current_epoch(curr_ts);
  assert!(ctx.accounts.delegated_position.last_claimed_epoch >= curr_epoch - 1);

  let delegated_position = &mut ctx.accounts.delegated_position;
  let sub_dao = &mut ctx.accounts.sub_dao;

  update_subdao_vehnt(sub_dao, &mut ctx.accounts.sub_dao_epoch_info, curr_ts)?;

  // Only subtract from the stake if the position ends after the end of this epoch. Otherwise,
  // the position was already purged due to the sub_dao_epoch_info closing info logic.
  if position.lockup.end_ts >= ctx.accounts.sub_dao_epoch_info.end_ts()
    || position.lockup.kind != LockupKind::Cliff
  {
    msg!(
      "Current vehnt {}, removing {}",
      sub_dao.vehnt_delegated,
      available_vehnt
    );
    // remove this stake information from the subdao
    sub_dao.vehnt_delegated = sub_dao
      .vehnt_delegated
      .checked_sub(available_vehnt)
      .unwrap();

    sub_dao.vehnt_fall_rate = sub_dao
      .vehnt_fall_rate
      .checked_sub(delegated_position.fall_rate)
      .unwrap();
  }

  ctx.accounts.sub_dao_epoch_info.sub_dao = ctx.accounts.sub_dao.key();
  ctx.accounts.sub_dao_epoch_info.bump_seed = *ctx.bumps.get("sub_dao_epoch_info").unwrap();
  ctx.accounts.sub_dao_epoch_info.epoch =
    current_epoch(ctx.accounts.registrar.load()?.clock_unix_timestamp());

  Ok(())
}
