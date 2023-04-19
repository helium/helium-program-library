use crate::curve::*;
use crate::error::ErrorCode;
use crate::state::*;
use crate::utils::{precise_supply_amt, to_mint_amount};
use anchor_lang::prelude::*;
use anchor_spl::token::{burn, TokenAccount};
use anchor_spl::token::{Burn, Mint, Token};
use circuit_breaker::{
  cpi::{accounts::TransferV0, transfer_v0},
  AccountWindowedCircuitBreakerV0, CircuitBreaker, TransferArgsV0,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct RedeemArgsV0 {
  pub amount: u64,
  pub expected_output_amount: u64, // Allows for slippage
}

#[derive(Accounts)]
#[instruction(args: RedeemArgsV0)]
pub struct RedeemV0<'info> {
  #[account(
    has_one = treasury,
    has_one = supply_mint,
    has_one = treasury_mint,
    seeds = ["treasury_management".as_bytes(), supply_mint.key().as_ref()],
    bump = treasury_management.bump_seed,
  )]
  pub treasury_management: Box<Account<'info, TreasuryManagementV0>>,
  pub treasury_mint: Box<Account<'info, Mint>>,
  #[account(mut)]
  pub supply_mint: Box<Account<'info, Mint>>,
  #[account(mut)]
  pub treasury: Box<Account<'info, TokenAccount>>,
  #[account(
    mut,
    seeds = ["account_windowed_breaker".as_bytes(), treasury.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump = circuit_breaker.bump_seed,
  )]
  pub circuit_breaker: Box<Account<'info, AccountWindowedCircuitBreakerV0>>,
  #[account(
    mut,
    has_one = owner,
    constraint = from.mint == supply_mint.key()
  )]
  pub from: Box<Account<'info, TokenAccount>>,
  #[account(
    mut,
    constraint = to.mint == treasury_mint.key()
  )]
  pub to: Box<Account<'info, TokenAccount>>,
  pub owner: Signer<'info>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
  pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<RedeemV0>, args: RedeemArgsV0) -> Result<()> {
  let amount = args.amount;
  let amount_prec = precise_supply_amt(amount, &ctx.accounts.supply_mint);
  let treasury_amount_u64 = ctx.accounts.treasury.amount;
  let treasury_amount = precise_supply_amt(treasury_amount_u64, &ctx.accounts.treasury_mint);
  let supply_u64 = ctx.accounts.supply_mint.supply;
  let supply = precise_supply_amt(supply_u64, &ctx.accounts.supply_mint);

  if ctx.accounts.treasury_management.freeze_unix_time <= Clock::get()?.unix_timestamp {
    return Err(error!(ErrorCode::Frozen));
  }

  let redeemed_prec = ctx
    .accounts
    .treasury_management
    .curve
    .price(&treasury_amount, &supply, &amount_prec, true)
    .ok_or_else(|| error!(ErrorCode::ArithmeticError))?;

  let redeemed = to_mint_amount(&redeemed_prec, &ctx.accounts.treasury_mint, false);

  burn(
    CpiContext::new(
      ctx.accounts.token_program.to_account_info(),
      Burn {
        from: ctx.accounts.from.to_account_info(),
        mint: ctx.accounts.supply_mint.to_account_info(),
        authority: ctx.accounts.owner.to_account_info(),
      },
    ),
    args.amount,
  )?;

  transfer_v0(
    CpiContext::new_with_signer(
      ctx.accounts.circuit_breaker_program.to_account_info(),
      TransferV0 {
        from: ctx.accounts.treasury.to_account_info(),
        to: ctx.accounts.to.to_account_info(),
        owner: ctx.accounts.treasury_management.to_account_info(),
        circuit_breaker: ctx.accounts.circuit_breaker.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
      },
      &[&[
        b"treasury_management",
        ctx.accounts.supply_mint.key().as_ref(),
        &[ctx.accounts.treasury_management.bump_seed],
      ]],
    ),
    TransferArgsV0 { amount: redeemed },
  )?;

  Err(error!(ErrorCode::Frozen))
  // Ok(())
}
