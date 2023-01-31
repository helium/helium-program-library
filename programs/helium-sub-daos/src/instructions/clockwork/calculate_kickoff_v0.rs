use crate::{current_epoch, state::*};
use anchor_lang::{prelude::*, solana_program::instruction::Instruction, InstructionData};
use anchor_spl::token::{Mint, Token};
use circuit_breaker::CircuitBreaker;
use clockwork_sdk::{self, state::ThreadResponse, utils::PAYER_PUBKEY};
use switchboard_v2::AggregatorAccountData;

#[derive(Accounts)]
pub struct CalculateKickoffV0<'info> {
  #[account(
    has_one = hnt_mint
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    has_one = dao,
    has_one = active_device_aggregator,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  pub hnt_mint: Box<Account<'info, Mint>>,

  pub active_device_aggregator: AccountLoader<'info, AggregatorAccountData>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
}

fn construct_next_ix(ctx: &Context<CalculateKickoffV0>, epoch: u64) -> Option<Instruction> {
  // get epoch info accounts needed
  let dao_key = ctx.accounts.dao.key();
  let dao_ei_seeds: &[&[u8]] = &[
    "dao_epoch_info".as_bytes(),
    dao_key.as_ref(),
    &epoch.to_le_bytes(),
  ];
  let prev_dao_ei_seeds: &[&[u8]] = &[
    "dao_epoch_info".as_bytes(),
    dao_key.as_ref(),
    &(epoch - 1).to_le_bytes(),
  ];
  let dao_epoch_info = Pubkey::find_program_address(dao_ei_seeds, &crate::id()).0;
  let prev_dao_epoch_info = Pubkey::find_program_address(prev_dao_ei_seeds, &crate::id()).0;

  let sub_dao_key = ctx.accounts.sub_dao.key();
  let sub_dao_ei_seeds: &[&[u8]] = &[
    "sub_dao_epoch_info".as_bytes(),
    sub_dao_key.as_ref(),
    &epoch.to_le_bytes(),
  ];
  let sub_dao_epoch_info = Pubkey::find_program_address(sub_dao_ei_seeds, &crate::id()).0;

  // build calculate utility score ix
  let accounts = vec![
    AccountMeta::new(PAYER_PUBKEY, true),
    AccountMeta::new_readonly(ctx.accounts.dao.registrar, false),
    AccountMeta::new_readonly(ctx.accounts.dao.key(), false),
    AccountMeta::new_readonly(ctx.accounts.hnt_mint.key(), false),
    AccountMeta::new(ctx.accounts.sub_dao.key(), false),
    AccountMeta::new_readonly(ctx.accounts.active_device_aggregator.key(), false),
    AccountMeta::new_readonly(
      ctx
        .accounts
        .active_device_aggregator
        .load()
        .ok()
        .unwrap()
        .history_buffer,
      false,
    ),
    AccountMeta::new_readonly(prev_dao_epoch_info, false),
    AccountMeta::new(dao_epoch_info, false),
    AccountMeta::new(sub_dao_epoch_info, false),
    AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
    AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
    AccountMeta::new_readonly(ctx.accounts.circuit_breaker_program.key(), false),
  ];
  Some(Instruction {
    program_id: crate::ID,
    accounts,
    data: crate::instruction::CalculateUtilityScoreV0 {
      args: crate::CalculateUtilityScoreArgsV0 { epoch },
    }
    .data(),
  })
}

/// This instruction is responsible for deriving the calculate utility score ix
pub fn handler(ctx: Context<CalculateKickoffV0>) -> Result<ThreadResponse> {
  let curr_ts = Clock::get()?.unix_timestamp;
  let epoch = current_epoch(curr_ts) - 1; // operate calculations on previous epoch
  let calculate_utility_ix = construct_next_ix(&ctx, epoch).unwrap();
  Ok(ThreadResponse {
    kickoff_instruction: None,
    next_instruction: Some(calculate_utility_ix.into()),
  })
}
