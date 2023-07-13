use crate::{construct_issue_hst_kickoff_ix, current_epoch, state::*};
use anchor_lang::{prelude::*, solana_program::native_token::LAMPORTS_PER_SOL};
use anchor_spl::token::Token;
use circuit_breaker::CircuitBreaker;
use clockwork_sdk::{
  cpi::{thread_create, thread_reset, thread_update},
  state::{ThreadSettings, Trigger},
  ThreadProgram,
};

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

  if ctx.accounts.thread.data_is_empty() && ctx.accounts.thread.lamports() == 0 {
    thread_create(
      CpiContext::new_with_signer(
        ctx.accounts.clockwork.to_account_info(),
        clockwork_sdk::cpi::ThreadCreate {
          authority: ctx.accounts.dao.to_account_info(),
          payer: ctx.accounts.thread_payer.to_account_info(),
          thread: ctx.accounts.thread.to_account_info(),
          system_program: ctx.accounts.system_program.to_account_info(),
        },
        signer_seeds,
      ),
      LAMPORTS_PER_SOL,
      "issue_hst".to_string().as_bytes().to_vec(),
      vec![kickoff_ix.into()],
      Trigger::Account {
        address: dao_epoch_info,
        offset: 8,
        size: 1,
      },
    )?;
  } else {
    thread_reset(CpiContext::new_with_signer(
      ctx.accounts.clockwork.to_account_info(),
      clockwork_sdk::cpi::ThreadReset {
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
