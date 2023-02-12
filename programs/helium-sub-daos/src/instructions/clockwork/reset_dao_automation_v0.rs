use crate::{construct_issue_hst_kickoff_ix, current_epoch, state::*};
use anchor_lang::{prelude::*, solana_program::native_token::LAMPORTS_PER_SOL};
use anchor_spl::token::Token;
use circuit_breaker::{CircuitBreaker, MintWindowedCircuitBreakerV0};
use clockwork_sdk::{
  cpi::{automation_create, automation_reset, automation_update},
  state::{AutomationSettings, Trigger},
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
  ///CHECK: seeds checked
  #[account(
    mut,
    seeds = [b"automation", dao.key().as_ref(), b"issue_hst"],
    seeds::program = clockwork.key(),
    bump
  )]
  pub automation: AccountInfo<'info>,
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
  let epoch = current_epoch(curr_ts);

  let dao_key = ctx.accounts.dao.key();
  let dao_ei_seeds: &[&[u8]] = &[
    "dao_epoch_info".as_bytes(),
    dao_key.as_ref(),
    &epoch.to_le_bytes(),
  ];
  let dao_epoch_info = Pubkey::find_program_address(dao_ei_seeds, &crate::id()).0;

  let signer_seeds: &[&[&[u8]]] = &[&[
    "dao".as_bytes(),
    ctx.accounts.dao.hnt_mint.as_ref(),
    &[ctx.accounts.dao.bump_seed],
  ]];

  if ctx.accounts.automation.data_is_empty() && ctx.accounts.automation.lamports() == 0 {
    automation_create(
      CpiContext::new_with_signer(
        ctx.accounts.clockwork.to_account_info(),
        clockwork_sdk::cpi::AutomationCreate {
          authority: ctx.accounts.dao.to_account_info(),
          payer: ctx.accounts.authority.to_account_info(),
          automation: ctx.accounts.automation.to_account_info(),
          system_program: ctx.accounts.system_program.to_account_info(),
        },
        signer_seeds,
      ),
      LAMPORTS_PER_SOL / 100,
      "issue_hst".to_string().as_bytes().to_vec(),
      vec![kickoff_ix.into()],
      Trigger::Account {
        address: dao_epoch_info,
        offset: 8,
        size: 1,
      },
    )?;
  } else {
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
        trigger: Some(Trigger::Account {
          address: dao_epoch_info,
          offset: 8,
          size: 1,
        }),
      },
    )?;
  }

  Ok(())
}
