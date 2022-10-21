use crate::circuit_breaker::WindowedCircuitBreakerConfigV0;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::TokenAccount;
use anchor_spl::token::{Mint, Token};
use circuit_breaker::{
  cpi::{accounts::InitializeAccountWindowedBreakerV0, initialize_account_windowed_breaker_v0},
  CircuitBreaker, InitializeAccountWindowedBreakerArgsV0,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeTreasuryManagementArgsV0 {
  pub authority: Pubkey,
  pub curve: Curve,
  pub freeze_unix_time: i64,
  pub window_config: WindowedCircuitBreakerConfigV0,
}

#[derive(Accounts)]
#[instruction(args: InitializeTreasuryManagementArgsV0)]
pub struct InitializeTreasuryManagementV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    init,
    payer = payer,
    space = 8 + std::mem::size_of::<TreasuryManagementV0>() + 60,
    seeds = ["treasury_management".as_bytes(), supply_mint.key().as_ref()],
    bump,
  )]
  pub treasury_management: Box<Account<'info, TreasuryManagementV0>>,
  pub treasury_mint: Box<Account<'info, Mint>>,
  pub supply_mint: Box<Account<'info, Mint>>,
  /// CHECK: Verified by cpi to init
  #[account(
    mut,
    seeds = ["account_windowed_breaker".as_bytes(), treasury.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump,
  )]
  pub circuit_breaker: AccountInfo<'info>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::authority = treasury_management,
    associated_token::mint = treasury_mint,
  )]
  pub treasury: Box<Account<'info, TokenAccount>>,
  pub system_program: Program<'info, System>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub token_program: Program<'info, Token>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
  ctx: Context<InitializeTreasuryManagementV0>,
  args: InitializeTreasuryManagementArgsV0,
) -> Result<()> {
  initialize_account_windowed_breaker_v0(
    CpiContext::new_with_signer(
      ctx.accounts.circuit_breaker_program.to_account_info(),
      InitializeAccountWindowedBreakerV0 {
        payer: ctx.accounts.payer.to_account_info(),
        circuit_breaker: ctx.accounts.circuit_breaker.to_account_info(),
        token_account: ctx.accounts.treasury.to_account_info(),
        owner: ctx.accounts.treasury_management.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        rent: ctx.accounts.rent.to_account_info(),
      },
      &[&[
        b"treasury_management",
        ctx.accounts.supply_mint.key().as_ref(),
        &[ctx.bumps["treasury_management"]],
      ]],
    ),
    InitializeAccountWindowedBreakerArgsV0 {
      authority: args.authority,
      config: args.window_config.into(),
      owner: ctx.accounts.treasury_management.key(),
    },
  )?;
  ctx
    .accounts
    .treasury_management
    .set_inner(TreasuryManagementV0 {
      authority: args.authority,
      treasury_mint: ctx.accounts.treasury_mint.key(),
      supply_mint: ctx.accounts.supply_mint.key(),
      treasury: ctx.accounts.treasury.key(),
      curve: args.curve,
      freeze_unix_time: args.freeze_unix_time,
      bump_seed: ctx.bumps["treasury_management"],
    });

  Ok(())
}
