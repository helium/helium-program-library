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
pub struct InitializeLazyDistributorArgsV0 {
  pub oracles: Vec<OracleConfigV0>,
  pub authority: Pubkey,
  pub window_config: WindowedCircuitBreakerConfigV0,
}

#[derive(Accounts)]
#[instruction(args: InitializeLazyDistributorArgsV0)]
pub struct InitializeLazyDistributorV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    init,
    payer = payer,
    space = 8 + 60 + std::mem::size_of::<LazyDistributorV0>() + std::mem::size_of_val(&*args.oracles),
    seeds = ["lazy_distributor".as_bytes(), rewards_mint.key().as_ref()],
    bump,
  )]
  pub lazy_distributor: Box<Account<'info, LazyDistributorV0>>,
  #[account(mut)]
  pub rewards_mint: Box<Account<'info, Mint>>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = rewards_mint,
    associated_token::authority = lazy_distributor
  )]
  pub rewards_escrow: Box<Account<'info, TokenAccount>>,
  /// CHECK: Checked via CPI
  #[account(
    mut,
    seeds = ["account_windowed_breaker".as_bytes(), rewards_escrow.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump,
  )]
  pub circuit_breaker: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
  pub token_program: Program<'info, Token>,
}

pub fn handler(
  ctx: Context<InitializeLazyDistributorV0>,
  args: InitializeLazyDistributorArgsV0,
) -> Result<()> {
  initialize_account_windowed_breaker_v0(
    CpiContext::new_with_signer(
      ctx.accounts.circuit_breaker_program.to_account_info(),
      InitializeAccountWindowedBreakerV0 {
        payer: ctx.accounts.payer.to_account_info(),
        circuit_breaker: ctx.accounts.circuit_breaker.to_account_info(),
        token_account: ctx.accounts.rewards_escrow.to_account_info(),
        owner: ctx.accounts.lazy_distributor.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
      },
      &[&[
        b"lazy_distributor",
        ctx.accounts.rewards_mint.key().as_ref(),
        &[ctx.bumps["lazy_distributor"]],
      ]],
    ),
    InitializeAccountWindowedBreakerArgsV0 {
      authority: args.authority,
      config: args.window_config.into(),
      owner: ctx.accounts.lazy_distributor.key(),
    },
  )?;

  ctx.accounts.lazy_distributor.set_inner(LazyDistributorV0 {
    rewards_mint: ctx.accounts.rewards_mint.key(),
    rewards_escrow: ctx.accounts.rewards_escrow.key(),
    oracles: args.oracles,
    version: 0,
    authority: args.authority,
    bump_seed: ctx.bumps["lazy_distributor"],
  });

  Ok(())
}
