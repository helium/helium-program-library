use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Token;
use circuit_breaker::CircuitBreaker;
use clockwork_sdk::{cpi::thread_delete, ThreadProgram};

#[derive(Accounts)]
pub struct ResetSubDaoThreadV0<'info> {
  #[account(mut)]
  pub authority: Signer<'info>,
  #[account(mut)]
  pub thread_payer: Signer<'info>,

  pub dao: Box<Account<'info, DaoV0>>,

  #[account(
    mut,
    has_one = authority,
    has_one = dao,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  ///CHECK: seeds checked
  #[account(
    mut,
    seeds = [b"thread", sub_dao.key().as_ref(), b"calculate"],
    seeds::program = clockwork.key(),
    bump
  )]
  pub calculate_thread: AccountInfo<'info>,
  ///CHECK: seeds checked
  #[account(
    mut,
    seeds = [b"thread", sub_dao.key().as_ref(), b"issue"],
    seeds::program = clockwork.key(),
    bump
  )]
  pub issue_thread: AccountInfo<'info>,
  pub clockwork: Program<'info, ThreadProgram>,

  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
}

pub fn handler(ctx: Context<ResetSubDaoThreadV0>) -> Result<()> {
  let signer_seeds: &[&[&[u8]]] = &[&[
    "sub_dao".as_bytes(),
    ctx.accounts.sub_dao.dnt_mint.as_ref(),
    &[ctx.accounts.sub_dao.bump_seed],
  ]];

  thread_delete(CpiContext::new_with_signer(
    ctx.accounts.clockwork.to_account_info(),
    clockwork_sdk::cpi::ThreadDelete {
      authority: ctx.accounts.sub_dao.to_account_info(),
      thread: ctx.accounts.issue_thread.to_account_info(),
      close_to: ctx.accounts.authority.to_account_info(),
    },
    signer_seeds,
  ))?;

  Ok(())
}
