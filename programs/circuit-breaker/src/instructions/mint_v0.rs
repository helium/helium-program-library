use anchor_lang::prelude::*;
use anchor_spl::token::{mint_to, Mint, MintTo, Token, TokenAccount};

use crate::{window::enforce_window, MintWindowedCircuitBreakerV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct MintArgsV0 {
  pub amount: u64,
}

#[derive(Accounts)]
pub struct MintV0<'info> {
  #[account(mut)]
  pub mint: Account<'info, Mint>,
  #[account(mut)]
  pub to: Account<'info, TokenAccount>,
  pub mint_authority: Signer<'info>,
  #[account(
    mut,
    has_one = mint_authority,
    seeds = ["mint_windowed_breaker".as_bytes(), mint.key().as_ref()],
    bump = circuit_breaker.bump_seed
  )]
  pub circuit_breaker: Box<Account<'info, MintWindowedCircuitBreakerV0>>,
  pub token_program: Program<'info, Token>,
  pub clock: Sysvar<'info, Clock>,
}

pub fn handler(ctx: Context<MintV0>, args: MintArgsV0) -> Result<()> {
  let circuit_breaker = &mut ctx.accounts.circuit_breaker;

  circuit_breaker.last_window = enforce_window(
    &circuit_breaker.config,
    &circuit_breaker.last_window,
    args.amount,
    ctx.accounts.mint.supply,
    ctx.accounts.clock.unix_timestamp,
  )?;

  mint_to(
    CpiContext::new_with_signer(
      ctx.accounts.token_program.to_account_info(),
      MintTo {
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.to.to_account_info(),
        authority: circuit_breaker.to_account_info(),
      },
      &[&[
        "mint_windowed_breaker".as_bytes(),
        ctx.accounts.mint.key().as_ref(),
        &[circuit_breaker.bump_seed],
      ]],
    ),
    args.amount,
  )?;

  Ok(())
}
