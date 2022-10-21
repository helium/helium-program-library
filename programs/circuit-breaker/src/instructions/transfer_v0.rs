use anchor_lang::prelude::*;
use anchor_spl::token::{transfer, Token, TokenAccount, Transfer};

use crate::{window::enforce_window, AccountWindowedCircuitBreakerV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct TransferArgsV0 {
  pub amount: u64,
}

#[derive(Accounts)]
pub struct TransferV0<'info> {
  #[account(mut)]
  pub from: Account<'info, TokenAccount>,
  #[account(mut)]
  pub to: Account<'info, TokenAccount>,
  pub owner: Signer<'info>,
  #[account(
    mut,
    has_one = owner,
    seeds = ["account_windowed_breaker".as_bytes(), from.key().as_ref()],
    bump = circuit_breaker.bump_seed
  )]
  pub circuit_breaker: Box<Account<'info, AccountWindowedCircuitBreakerV0>>,
  pub token_program: Program<'info, Token>,
  pub clock: Sysvar<'info, Clock>,
}

pub fn handler(ctx: Context<TransferV0>, args: TransferArgsV0) -> Result<()> {
  let circuit_breaker = &mut ctx.accounts.circuit_breaker;

  circuit_breaker.last_window = enforce_window(
    &circuit_breaker.config,
    &circuit_breaker.last_window,
    args.amount,
    ctx.accounts.from.amount,
    ctx.accounts.clock.unix_timestamp,
  )?;

  transfer(
    CpiContext::new_with_signer(
      ctx.accounts.token_program.to_account_info(),
      Transfer {
        from: ctx.accounts.from.to_account_info(),
        to: ctx.accounts.to.to_account_info(),
        authority: circuit_breaker.to_account_info(),
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
