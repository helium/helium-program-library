use crate::{current_epoch, state::*};
use anchor_lang::{prelude::*, solana_program::instruction::Instruction, InstructionData};
use anchor_spl::token::{Mint, Token};
use circuit_breaker::CircuitBreaker;
use clockwork_sdk::{self, state::ThreadResponse};

#[derive(Accounts)]
pub struct IssueRewardsKickoffV0<'info> {
  #[account(
    has_one = hnt_mint
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    has_one = dao,
    has_one = dnt_mint,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  pub hnt_mint: Box<Account<'info, Mint>>,
  pub dnt_mint: Box<Account<'info, Mint>>,

  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
}

fn construct_issue_rewards_ix(ctx: &Context<IssueRewardsKickoffV0>, epoch: u64) -> Instruction {
  // get epoch info accounts needed
  let dao_key = ctx.accounts.dao.key();
  let dao_ei_seeds: &[&[u8]] = &[
    "dao_epoch_info".as_bytes(),
    dao_key.as_ref(),
    &epoch.to_le_bytes(),
  ];
  let dao_epoch_info = Pubkey::find_program_address(dao_ei_seeds, &crate::id()).0;

  let sub_dao_key = ctx.accounts.sub_dao.key();
  let sub_dao_ei_seeds: &[&[u8]] = &[
    "sub_dao_epoch_info".as_bytes(),
    sub_dao_key.as_ref(),
    &epoch.to_le_bytes(),
  ];
  let sub_dao_epoch_info = Pubkey::find_program_address(sub_dao_ei_seeds, &crate::id()).0;

  let hnt_circuit_breaker = Pubkey::find_program_address(
    &[
      "mint_windowed_breaker".as_bytes(),
      ctx.accounts.hnt_mint.key().as_ref(),
    ],
    &ctx.accounts.circuit_breaker_program.key(),
  )
  .0;
  let dnt_circuit_breaker = Pubkey::find_program_address(
    &[
      "mint_windowed_breaker".as_bytes(),
      ctx.accounts.dnt_mint.key().as_ref(),
    ],
    &ctx.accounts.circuit_breaker_program.key(),
  )
  .0;

  Instruction {
    program_id: crate::ID,
    accounts: crate::accounts::IssueRewardsV0 {
      dao: ctx.accounts.dao.key(),
      sub_dao: ctx.accounts.sub_dao.key(),
      dao_epoch_info,
      sub_dao_epoch_info,
      hnt_circuit_breaker,
      dnt_circuit_breaker,
      hnt_mint: ctx.accounts.hnt_mint.key(),
      dnt_mint: ctx.accounts.dnt_mint.key(),
      treasury: ctx.accounts.sub_dao.treasury,
      rewards_escrow: ctx.accounts.sub_dao.rewards_escrow,
      delegator_pool: ctx.accounts.sub_dao.delegator_pool,
      system_program: ctx.accounts.system_program.key(),
      token_program: ctx.accounts.token_program.key(),
      circuit_breaker_program: ctx.accounts.circuit_breaker_program.key(),
    }
    .to_account_metas(Some(true)),
    data: crate::instruction::IssueRewardsV0 {
      args: crate::IssueRewardsArgsV0 { epoch },
    }
    .data(),
  }
}

pub fn handler(ctx: Context<IssueRewardsKickoffV0>) -> Result<ThreadResponse> {
  let curr_ts = Clock::get()?.unix_timestamp + 1; // Ensure we don't land exactly on utc midnight
  let epoch = current_epoch(curr_ts) - 1; // operate calculations on previous epoch
  let issue_rewards_ix = construct_issue_rewards_ix(&ctx, epoch);
  Ok(ThreadResponse {
    dynamic_instruction: Some(issue_rewards_ix.into()),
    trigger: None,
    close_to: None,
  })
}
