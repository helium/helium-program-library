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
  pub hnt_threshold: u64,
  pub dca_mint: Pubkey,
  pub dca_swap_amount: u64,
  pub dca_interval_seconds: u64,
  pub dca_input_price_oracle: Pubkey,
  pub dca_url: String,
  pub dca_signer: Pubkey,
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
    space = 60 + 8 + std::mem::size_of::<AutoTopOffV0>(),
    seeds = [b"auto_top_off", delegated_data_credits.key().as_ref(), authority.key().as_ref()],
    bump
  )]
  pub auto_top_off: AccountLoader<'info, AutoTopOffV0>,
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
  pub dca_mint: Box<Account<'info, Mint>>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = dca_mint,
    associated_token::authority = auto_top_off,
  )]
  pub dca_mint_account: Box<Account<'info, TokenAccount>>,
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

pub fn handler(
  ctx: Context<InitializeAutoTopOffV0>,
  args: InitializeAutoTopOffArgsV0,
) -> Result<()> {
  // Validate schedule
  Schedule::from_str(&args.schedule).map_err(|e| {
    msg!("Invalid schedule {}", e);
    ErrorCode::InvalidSchedule
  })?;

  let mut auto_top_off = ctx.accounts.auto_top_off.load_init()?;
  let arr = args.schedule.as_bytes();
  let mut schedule = [0; 128];
  let mut dca_url = [0; 128];
  dca_url[..args.dca_url.len()].copy_from_slice(args.dca_url.as_bytes());
  schedule[..arr.len()].copy_from_slice(arr);
  *auto_top_off = AutoTopOffV0 {
    dca_signer: args.dca_signer,
    authority: ctx.accounts.authority.key(),
    data_credits: ctx.accounts.data_credits.key(),
    sub_dao: ctx.accounts.sub_dao.key(),
    threshold: args.threshold,
    next_task: ctx.accounts.auto_top_off.key(),
    next_hnt_task: ctx.accounts.auto_top_off.key(),
    schedule,
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
    hnt_threshold: args.hnt_threshold,
    dca_mint: ctx.accounts.dca_mint.key(),
    dca_mint_account: ctx.accounts.dca_mint_account.key(),
    dca_swap_amount: args.dca_swap_amount,
    dca_interval_seconds: args.dca_interval_seconds,
    dca_input_price_oracle: args.dca_input_price_oracle,
    dca_url,
    dca: Pubkey::find_program_address(
      &[
        b"dca",
        ctx.accounts.auto_top_off.key().as_ref(),
        ctx.accounts.data_credits.dc_mint.as_ref(),
        ctx.accounts.data_credits.hnt_mint.as_ref(),
        0_u16.to_le_bytes().as_ref(),
      ],
      &tuktuk_dca::ID,
    )
    .0,
    reserved: [0; 6],
  };

  Ok(())
}
