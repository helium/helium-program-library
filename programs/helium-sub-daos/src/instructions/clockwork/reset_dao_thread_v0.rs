use crate::{construct_issue_hst_ix, create_end_epoch_cron, current_epoch, state::*};
use anchor_lang::prelude::*;
use anchor_spl::token::Token;
use circuit_breaker::{CircuitBreaker, MintWindowedCircuitBreakerV0};
use clockwork_sdk::{
  cpi::{thread_stop, thread_update},
  state::{Thread, ThreadSettings, Trigger},
  ThreadProgram,
};

#[derive(Accounts)]
#[instruction()]
pub struct ResetDaoThreadV0<'info> {
  pub authority: Signer<'info>,

  #[account(
    mut,
    seeds = ["dao".as_bytes(), dao.hnt_mint.as_ref()],
    bump=dao.bump_seed,
    has_one = authority,
  )]
  pub dao: Box<Account<'info, DaoV0>>,

  #[account(
    mut,
    seeds = ["mint_windowed_breaker".as_bytes(), dao.hnt_mint.as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump = hnt_circuit_breaker.bump_seed
  )]
  pub hnt_circuit_breaker: Box<Account<'info, MintWindowedCircuitBreakerV0>>,

  #[account(
    mut,
    seeds = [b"thread", dao.key().as_ref(), b"end-epoch"],
    seeds::program = clockwork.key(),
    bump
  )]
  pub thread: Account<'info, Thread>,
  pub clockwork: Program<'info, ThreadProgram>,

  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
}

pub fn handler(ctx: Context<ResetDaoThreadV0>) -> Result<()> {
  let curr_ts = Clock::get()?.unix_timestamp;
  let epoch = current_epoch(curr_ts);

  let dao_key = ctx.accounts.dao.key();
  let dao_ei_seeds: &[&[u8]] = &[
    "dao_epoch_info".as_bytes(),
    dao_key.as_ref(),
    &epoch.to_le_bytes(),
  ];
  let dao_epoch_info = Pubkey::find_program_address(dao_ei_seeds, &crate::id()).0;

  let kickoff_ix = construct_issue_hst_ix(
    ctx.accounts.dao.key(),
    ctx.accounts.hnt_circuit_breaker.key(),
    ctx.accounts.dao.hnt_mint,
    ctx.accounts.dao.hst_pool,
    ctx.accounts.system_program.key(),
    ctx.accounts.token_program.key(),
    ctx.accounts.circuit_breaker_program.key(),
    ctx.accounts.thread.key(),
    ctx.accounts.clockwork.key(),
    dao_epoch_info,
    epoch,
  )
  .unwrap();

  let curr_ts = Clock::get()?.unix_timestamp;
  let cron = create_end_epoch_cron(curr_ts, 60 * 5);

  let signer_seeds: &[&[&[u8]]] = &[&[
    "dao".as_bytes(),
    ctx.accounts.dao.hnt_mint.as_ref(),
    &[ctx.accounts.dao.bump_seed],
  ]];

  thread_stop(CpiContext::new_with_signer(
    ctx.accounts.clockwork.to_account_info(),
    clockwork_sdk::cpi::ThreadStop {
      authority: ctx.accounts.dao.to_account_info(),
      thread: ctx.accounts.thread.to_account_info(),
    },
    signer_seeds,
  ))?;
  thread_update(
    CpiContext::new_with_signer(
      ctx.accounts.clockwork.to_account_info(),
      clockwork_sdk::cpi::ThreadUpdate {
        authority: ctx.accounts.dao.to_account_info(),
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
