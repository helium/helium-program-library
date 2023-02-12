use crate::{construct_issue_hst_kickoff_ix, create_end_epoch_cron, state::*};
use anchor_lang::prelude::*;
use anchor_spl::token::Token;
use circuit_breaker::{CircuitBreaker, MintWindowedCircuitBreakerV0};
use clockwork_sdk::{
  cpi::{automation_reset, automation_update},
  state::{Automation, AutomationSettings, Trigger},
  AutomationProgram,
};

#[derive(Accounts)]
pub struct ResetDaoAutomationV0<'info> {
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
    seeds = [b"automation", dao.key().as_ref(), b"issue_hst"],
    seeds::program = clockwork.key(),
    bump
  )]
  pub automation: Account<'info, Automation>,
  pub clockwork: Program<'info, AutomationProgram>,

  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
}

pub fn handler(ctx: Context<ResetDaoAutomationV0>) -> Result<()> {
  let kickoff_ix = construct_issue_hst_kickoff_ix(
    ctx.accounts.dao.key(),
    ctx.accounts.dao.hnt_mint,
    ctx.accounts.system_program.key(),
    ctx.accounts.token_program.key(),
    ctx.accounts.circuit_breaker_program.key(),
  );

  let curr_ts = Clock::get()?.unix_timestamp;
  let cron = create_end_epoch_cron(curr_ts, 60 * 5);

  let signer_seeds: &[&[&[u8]]] = &[&[
    "dao".as_bytes(),
    ctx.accounts.dao.hnt_mint.as_ref(),
    &[ctx.accounts.dao.bump_seed],
  ]];

  automation_reset(CpiContext::new_with_signer(
    ctx.accounts.clockwork.to_account_info(),
    clockwork_sdk::cpi::AutomationReset {
      authority: ctx.accounts.dao.to_account_info(),
      automation: ctx.accounts.automation.to_account_info(),
    },
    signer_seeds,
  ))?;
  automation_update(
    CpiContext::new_with_signer(
      ctx.accounts.clockwork.to_account_info(),
      clockwork_sdk::cpi::AutomationUpdate {
        authority: ctx.accounts.dao.to_account_info(),
        automation: ctx.accounts.automation.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
      },
      signer_seeds,
    ),
    AutomationSettings {
      name: None,
      fee: None,
      instructions: Some(vec![kickoff_ix.into()]),
      rate_limit: None,
      trigger: Some(Trigger::Cron {
        schedule: cron,
        skippable: false,
      }),
    },
  )?;
  Ok(())
}
