use anchor_lang::prelude::*;
use anchor_spl::token::{burn, Burn, Mint, Token, TokenAccount};

use crate::{window::enforce_window, AccountWindowedCircuitBreakerV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct BurnArgsV0 {
  pub amount: u64,
}

#[derive(Accounts)]
pub struct BurnV0<'info> {
  #[account(mut)]
  pub from: Account<'info, TokenAccount>,
  pub owner: Signer<'info>,
  #[account(mut)]
  pub mint: Account<'info, Mint>,
  #[account(
    mut,
    has_one = owner,
    seeds = ["account_windowed_breaker".as_bytes(), from.key().as_ref()],
    bump = circuit_breaker.bump_seed
  )]
  pub circuit_breaker: Box<Account<'info, AccountWindowedCircuitBreakerV0>>,
  pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<BurnV0>, args: BurnArgsV0) -> Result<()> {
  let circuit_breaker = &mut ctx.accounts.circuit_breaker;

  circuit_breaker.last_window = enforce_window(
    &circuit_breaker.config,
    &circuit_breaker.last_window,
    args.amount,
    ctx.accounts.from.amount,
    Clock::get()?.unix_timestamp,
  )?;

  burn(
    CpiContext::new_with_signer(
      ctx.accounts.token_program.to_account_info(),
      Burn {
        mint: ctx.accounts.mint.to_account_info(),
        authority: circuit_breaker.to_account_info(),
        from: ctx.accounts.from.to_account_info(),
      },
      &[&[
        "account_windowed_breaker".as_bytes(),
        ctx.accounts.from.key().as_ref(),
        &[circuit_breaker.bump_seed],
      ]],
    ),
    args.amount,
  )?;

  Ok(())
}
