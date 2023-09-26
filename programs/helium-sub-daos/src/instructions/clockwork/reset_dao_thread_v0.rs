use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Token;
use circuit_breaker::CircuitBreaker;
use clockwork_sdk::{cpi::thread_delete, ThreadProgram};

#[derive(Accounts)]
pub struct ResetDaoThreadV0<'info> {
  pub authority: Signer<'info>,
  #[account(mut)]
  pub thread_payer: Signer<'info>,

  #[account(
    mut,
    seeds = ["dao".as_bytes(), dao.hnt_mint.as_ref()],
    bump=dao.bump_seed,
    has_one = authority,
  )]
  pub dao: Box<Account<'info, DaoV0>>,

  ///CHECK: seeds checked
  #[account(
    mut,
    seeds = [b"thread", dao.key().as_ref(), b"issue_hst"],
    seeds::program = clockwork.key(),
    bump
  )]
  pub thread: AccountInfo<'info>,
  pub clockwork: Program<'info, ThreadProgram>,

  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
}

pub fn handler(ctx: Context<ResetDaoThreadV0>) -> Result<()> {
  let signer_seeds: &[&[&[u8]]] = &[&[
    "dao".as_bytes(),
    ctx.accounts.dao.hnt_mint.as_ref(),
    &[ctx.accounts.dao.bump_seed],
  ]];

  thread_delete(CpiContext::new_with_signer(
    ctx.accounts.clockwork.to_account_info(),
    clockwork_sdk::cpi::ThreadDelete {
      authority: ctx.accounts.dao.to_account_info(),
      thread: ctx.accounts.thread.to_account_info(),
      close_to: ctx.accounts.authority.to_account_info(),
    },
    signer_seeds,
  ))?;

  Ok(())
}
