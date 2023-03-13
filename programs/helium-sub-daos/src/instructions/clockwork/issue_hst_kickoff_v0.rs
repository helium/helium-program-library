use crate::{current_epoch, state::*};
use anchor_lang::{prelude::*, solana_program::instruction::Instruction, InstructionData};
use anchor_spl::token::{Mint, Token};
use circuit_breaker::CircuitBreaker;
use clockwork_sdk::{self, state::ThreadResponse};

#[derive(Accounts)]
pub struct IssueHstKickoffV0<'info> {
  #[account(
    has_one = hnt_mint
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  pub hnt_mint: Box<Account<'info, Mint>>,

  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
}

fn construct_issue_hst_ix(ctx: &Context<IssueHstKickoffV0>, epoch: u64) -> Instruction {
  // get epoch info accounts needed
  let dao_key = ctx.accounts.dao.key();
  let dao_ei_seeds: &[&[u8]] = &[
    "dao_epoch_info".as_bytes(),
    dao_key.as_ref(),
    &epoch.to_le_bytes(),
  ];
  let dao_epoch_info = Pubkey::find_program_address(dao_ei_seeds, &crate::id()).0;

  let hnt_circuit_breaker = Pubkey::find_program_address(
    &[
      "mint_windowed_breaker".as_bytes(),
      ctx.accounts.hnt_mint.key().as_ref(),
    ],
    &ctx.accounts.circuit_breaker_program.key(),
  )
  .0;

  Instruction {
    program_id: crate::ID,
    accounts: crate::accounts::IssueHstPoolV0 {
      dao: ctx.accounts.dao.key(),
      dao_epoch_info,
      hnt_circuit_breaker,
      hnt_mint: ctx.accounts.hnt_mint.key(),
      hst_pool: ctx.accounts.dao.hst_pool,
      system_program: ctx.accounts.system_program.key(),
      token_program: ctx.accounts.token_program.key(),
      circuit_breaker_program: ctx.accounts.circuit_breaker_program.key(),
    }
    .to_account_metas(Some(true)),
    data: crate::instruction::IssueHstPoolV0 {
      args: crate::IssueHstPoolArgsV0 { epoch },
    }
    .data(),
  }
}

pub fn handler(ctx: Context<IssueHstKickoffV0>) -> Result<ThreadResponse> {
  let curr_ts = Clock::get()?.unix_timestamp + 1; // Ensure we don't land exactly on utc midnight
  let epoch = current_epoch(curr_ts) - 1; // operate calculations on previous epoch
  let issue_hst_ix = construct_issue_hst_ix(&ctx, epoch);
  Ok(ThreadResponse {
    dynamic_instruction: Some(issue_hst_ix.into()),
    trigger: None,
    close_to: None,
  })
}
