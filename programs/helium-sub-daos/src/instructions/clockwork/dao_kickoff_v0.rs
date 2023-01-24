use crate::{current_epoch, state::*};
use anchor_lang::{prelude::*, solana_program::instruction::Instruction, InstructionData};
use anchor_spl::token::{Mint, Token, TokenAccount};
use circuit_breaker::{CircuitBreaker, MintWindowedCircuitBreakerV0};
use clockwork_sdk::{self, state::ThreadResponse};

#[derive(Accounts)]
pub struct DaoKickoffV0<'info> {
  #[account(
    has_one = hnt_mint,
    has_one = hst_pool
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    seeds = ["mint_windowed_breaker".as_bytes(), hnt_mint.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump = hnt_circuit_breaker.bump_seed
  )]
  pub hnt_circuit_breaker: Box<Account<'info, MintWindowedCircuitBreakerV0>>,
  pub hnt_mint: Box<Account<'info, Mint>>,
  pub hst_pool: Box<Account<'info, TokenAccount>>,
  pub token_program: Program<'info, Token>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
}

fn construct_next_ix(ctx: &Context<DaoKickoffV0>, epoch: u64) -> Option<Instruction> {
  // get epoch info accounts needed
  let dao_key = ctx.accounts.dao.key();
  let dao_ei_seeds: &[&[u8]] = &[
    "dao_epoch_info".as_bytes(),
    dao_key.as_ref(),
    &epoch.to_le_bytes(),
  ];
  let dao_epoch_info = Pubkey::find_program_address(dao_ei_seeds, &crate::id()).0;

  // build issue hst pool ix
  let accounts = vec![
    AccountMeta::new_readonly(ctx.accounts.dao.key(), false),
    AccountMeta::new(dao_epoch_info, false),
    AccountMeta::new(ctx.accounts.hnt_circuit_breaker.key(), false),
    AccountMeta::new(ctx.accounts.hnt_mint.key(), false),
    AccountMeta::new(ctx.accounts.hst_pool.key(), false),
    AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
    AccountMeta::new_readonly(ctx.accounts.circuit_breaker_program.key(), false),
  ];
  Some(Instruction {
    program_id: crate::ID,
    accounts,
    data: crate::instruction::IssueHstPoolV0 {
      args: crate::IssueHstPoolArgsV0 { epoch },
    }
    .data(),
  })
}

pub fn handler(ctx: Context<DaoKickoffV0>) -> Result<ThreadResponse> {
  let curr_ts = Clock::get()?.unix_timestamp;
  let epoch = current_epoch(curr_ts) - 1; // operate calculations on previous epoch
  let issue_hst_ix = construct_next_ix(&ctx, epoch).unwrap();
  Ok(ThreadResponse {
    kickoff_instruction: None,
    next_instruction: Some(issue_hst_ix.into()),
  })
}
