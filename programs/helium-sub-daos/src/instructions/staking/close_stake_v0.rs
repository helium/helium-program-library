use crate::{current_epoch, state::*, update_subdao_vehnt};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};
use clockwork_sdk::{cpi::thread_delete, state::Thread, ThreadProgram};

use voter_stake_registry::state::{PositionV0, Registrar};

#[derive(Accounts)]
pub struct CloseStakeV0<'info> {
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
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    mut,
    has_one = dao,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,

  #[account(
    mut,
    close = position_authority,
    seeds = ["stake_position".as_bytes(), position.key().as_ref()],
    bump
  )]
  pub stake_position: Account<'info, StakePositionV0>,

  ///CHECK: constraints
  #[account(address = voter_stake_registry::ID)]
  pub vsr_program: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
  pub clock: Sysvar<'info, Clock>,
  pub rent: Sysvar<'info, Rent>,

  #[account(
    mut,
    seeds = [b"thread", stake_position.key().as_ref(), b"purge"],
    seeds::program = clockwork.key(),
    bump
  )]
  pub thread: Account<'info, Thread>,
  pub clockwork: Program<'info, ThreadProgram>,
}

pub fn handler(ctx: Context<CloseStakeV0>) -> Result<()> {
  // load the vehnt information
  let position = &mut ctx.accounts.position;
  let registrar = &ctx.accounts.registrar.load()?;
  let voting_mint_config = &registrar.voting_mints[position.voting_mint_config_idx as usize];
  let curr_ts = registrar.clock_unix_timestamp();
  let available_vehnt = position.voting_power(voting_mint_config, curr_ts)?;

  // don't allow unstake without claiming available rewards
  let curr_epoch = current_epoch(ctx.accounts.clock.unix_timestamp);
  assert!(ctx.accounts.stake_position.last_claimed_epoch >= curr_epoch - 1);

  let stake_position = &mut ctx.accounts.stake_position;
  let sub_dao = &mut ctx.accounts.sub_dao;

  update_subdao_vehnt(sub_dao, curr_ts);

  // remove this stake information from the subdao
  sub_dao.vehnt_staked = sub_dao
    .vehnt_staked
    .checked_sub(i128::from(available_vehnt))
    .unwrap();
  sub_dao.vehnt_fall_rate = sub_dao
    .vehnt_fall_rate
    .checked_sub(stake_position.fall_rate)
    .unwrap();

  // delete the purge position thread
  let signer_seeds: &[&[&[u8]]] = &[&[
    "stake_position".as_bytes(),
    ctx.accounts.position.to_account_info().key.as_ref(),
    &[ctx.bumps["stake_position"]],
  ]];
  thread_delete(CpiContext::new_with_signer(
    ctx.accounts.clockwork.to_account_info(),
    clockwork_sdk::cpi::ThreadDelete {
      authority: stake_position.to_account_info(),
      close_to: ctx.accounts.position_authority.to_account_info(),
      thread: ctx.accounts.thread.to_account_info(),
    },
    signer_seeds,
  ))?;
  Ok(())
}
