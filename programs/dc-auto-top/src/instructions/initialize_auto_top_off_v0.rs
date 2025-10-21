use std::str::FromStr;

use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use circuit_breaker::MintWindowedCircuitBreakerV0;
use clockwork_cron::Schedule;
use data_credits::{DataCreditsV0, DelegatedDataCreditsV0};
use helium_sub_daos::{DaoV0, SubDaoV0};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;
use tuktuk_program::TaskQueueV0;

use crate::{errors::ErrorCode, state::*};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InitializeAutoTopOffArgsV0 {
  pub schedule: String,
  pub threshold: u64,
  pub router_key: String,
}

#[derive(Accounts)]
#[instruction(args: InitializeAutoTopOffArgsV0)]
pub struct InitializeAutoTopOffV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub authority: Signer<'info>,
  #[account(
    init,
    payer = payer,
    space = AutoTopOffV0::size(&args),
    seeds = [b"auto_top_off", delegated_data_credits.key().as_ref(), authority.key().as_ref()],
    bump
  )]
  pub auto_top_off: Box<Account<'info, AutoTopOffV0>>,
  pub hnt_price_oracle: Box<Account<'info, PriceUpdateV2>>,
  #[account(has_one = dc_mint, has_one = hnt_mint)]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(has_one = dc_mint)]
  pub data_credits: Box<Account<'info, DataCreditsV0>>,
  pub dc_mint: Box<Account<'info, Mint>>,
  pub hnt_mint: Box<Account<'info, Mint>>,
  #[account(
    has_one = data_credits,
    has_one = sub_dao,
    constraint = delegated_data_credits.router_key == args.router_key
  )]
  pub delegated_data_credits: Box<Account<'info, DelegatedDataCreditsV0>>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = dc_mint,
    associated_token::authority = auto_top_off,
  )]
  pub dc_account: Box<Account<'info, TokenAccount>>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = hnt_mint,
    associated_token::authority = auto_top_off,
  )]
  pub hnt_account: Box<Account<'info, TokenAccount>>,
  #[account(has_one = dao)]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(mut)]
  pub task_queue: Account<'info, TaskQueueV0>,
  #[account(
    seeds = ["mint_windowed_breaker".as_bytes(), dc_mint.key().as_ref()],
    seeds::program = circuit_breaker::ID,
    bump = circuit_breaker.bump_seed
  )]
  pub circuit_breaker: Box<Account<'info, MintWindowedCircuitBreakerV0>>,
  /// CHECK: Via seeds
  #[account(
    seeds = [b"queue_authority"],
    bump
  )]
  pub queue_authority: UncheckedAccount<'info>,
  pub system_program: Program<'info, System>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub token_program: Program<'info, Token>,
}

impl AutoTopOffV0 {
  pub fn size(args: &InitializeAutoTopOffArgsV0) -> usize {
    // Discriminator
    let mut size = 8;
    // Pubkey fields: authority, data_credits, sub_dao, task_queue, next_task, next_pyth_task, delegated_data_credits, dc_mint, hnt_mint, dao, hnt_price_oracle, hnt_account, dc_account, escrow_account, circuit_breaker (15 * 32)
    size += 15 * 32;
    // bump: u8
    size += 1;
    // schedule: String (4 bytes len + string bytes)
    size += 4 + args.schedule.len();
    // threshold: u64 (8)
    size += 8;
    // queue_authority_bump: u8
    size += 1;
    size
  }
}

pub fn handler(
  ctx: Context<InitializeAutoTopOffV0>,
  args: InitializeAutoTopOffArgsV0,
) -> Result<()> {
  // Validate schedule
  Schedule::from_str(&args.schedule).map_err(|e| {
    msg!("Invalid schedule {}", e);
    ErrorCode::InvalidSchedule
  })?;

  let auto_top_off = &mut ctx.accounts.auto_top_off;
  auto_top_off.set_inner(AutoTopOffV0 {
    authority: ctx.accounts.authority.key(),
    data_credits: ctx.accounts.data_credits.key(),
    sub_dao: ctx.accounts.sub_dao.key(),
    threshold: args.threshold,
    next_task: auto_top_off.key(),
    next_pyth_task: auto_top_off.key(),
    schedule: args.schedule,
    bump: ctx.bumps.auto_top_off,
    task_queue: ctx.accounts.task_queue.key(),
    queue_authority_bump: ctx.bumps.queue_authority,
    delegated_data_credits: ctx.accounts.delegated_data_credits.key(),
    dc_mint: ctx.accounts.data_credits.dc_mint,
    hnt_mint: ctx.accounts.data_credits.hnt_mint,
    dao: ctx.accounts.dao.key(),
    hnt_price_oracle: ctx.accounts.hnt_price_oracle.key(),
    hnt_account: ctx.accounts.hnt_account.key(),
    dc_account: ctx.accounts.dc_account.key(),
    circuit_breaker: ctx.accounts.circuit_breaker.key(),
    escrow_account: ctx.accounts.delegated_data_credits.escrow_account,
  });

  Ok(())
}
