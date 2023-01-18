use crate::{construct_sub_dao_kickoff_ix, create_end_epoch_cron, state::*};
use anchor_lang::prelude::*;
use anchor_spl::token::Token;
use circuit_breaker::CircuitBreaker;
use clockwork_sdk::{
  cpi::thread_update,
  state::{Thread, ThreadSettings, Trigger},
  ThreadProgram,
};

#[derive(Accounts)]
#[instruction()]
pub struct ResetSubDaoThreadV0<'info> {
  #[account(mut)]
  pub authority: Signer<'info>,

  pub dao: Box<Account<'info, DaoV0>>,

  #[account(
    mut,
    has_one = authority,
    has_one = dao,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(
    mut,
    seeds = [b"thread", sub_dao.key().as_ref(), b"end-epoch"],
    seeds::program = clockwork.key(),
    bump
  )]
  pub thread: Account<'info, Thread>,
  pub clockwork: Program<'info, ThreadProgram>,

  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
}

pub fn handler(ctx: Context<ResetSubDaoThreadV0>) -> Result<()> {
  let kickoff_ix = construct_sub_dao_kickoff_ix(
    ctx.accounts.dao.key(),
    ctx.accounts.sub_dao.key(),
    ctx.accounts.dao.hnt_mint,
    ctx.accounts.sub_dao.active_device_aggregator,
    ctx.accounts.system_program.key(),
    ctx.accounts.token_program.key(),
    ctx.accounts.circuit_breaker_program.key(),
  )
  .unwrap();
  let curr_ts = Clock::get()?.unix_timestamp;

  let cron = create_end_epoch_cron(curr_ts, 60 * 5);

  let signer_seeds: &[&[&[u8]]] = &[&[
    "sub_dao".as_bytes(),
    ctx.accounts.sub_dao.dnt_mint.as_ref(),
    &[ctx.accounts.sub_dao.bump_seed],
  ]];
  thread_update(
    CpiContext::new_with_signer(
      ctx.accounts.clockwork.to_account_info(),
      clockwork_sdk::cpi::ThreadUpdate {
        authority: ctx.accounts.sub_dao.to_account_info(),
        thread: ctx.accounts.thread.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
      },
      signer_seeds,
    ),
    ThreadSettings {
      fee: None,
      kickoff_instruction: Some(kickoff_ix.into()),
      rate_limit: None,
      trigger: Some(Trigger::Cron {
        schedule: cron,
        skippable: false,
      }),
    },
  )?;
  Ok(())
}
