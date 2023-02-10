use crate::{current_epoch, state::*};
use anchor_lang::{prelude::*, solana_program::instruction::Instruction, InstructionData};
use anchor_spl::token::{Mint, Token};
use circuit_breaker::CircuitBreaker;
use clockwork_sdk::{self, state::AutomationResponse};

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

  // build issue hst pool ix
  let accounts = vec![
    AccountMeta::new(ctx.accounts.dao.key(), false),
    AccountMeta::new(dao_epoch_info, false),
    AccountMeta::new(hnt_circuit_breaker, false),
    AccountMeta::new(ctx.accounts.hnt_mint.key(), false),
    AccountMeta::new(ctx.accounts.dao.hst_pool, false),
    AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
    AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
    AccountMeta::new_readonly(ctx.accounts.circuit_breaker_program.key(), false),
  ];
  Instruction {
    program_id: crate::ID,
    accounts,
    data: crate::instruction::IssueHstPoolV0 {
      args: crate::IssueHstPoolArgsV0 { epoch },
    }
    .data(),
  }
}

pub fn handler(ctx: Context<IssueHstKickoffV0>) -> Result<AutomationResponse> {
  let curr_ts = Clock::get()?.unix_timestamp;
  let epoch = current_epoch(curr_ts) - 1; // operate calculations on previous epoch
  let issue_hst_ix = construct_issue_hst_ix(&ctx, epoch);
  Ok(AutomationResponse {
    next_instruction: Some(issue_hst_ix.into()),
    trigger: None,
  })
}
