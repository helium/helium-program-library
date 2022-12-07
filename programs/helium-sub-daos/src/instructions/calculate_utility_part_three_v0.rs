use crate::{current_epoch, error::ErrorCode, state::*, CalculateUtilityPartOneArgsV0, TESTING};
use anchor_lang::{prelude::*, solana_program::instruction::Instruction, InstructionData};
use anchor_spl::token::Token;
use circuit_breaker::CircuitBreaker;
use clockwork_sdk::{
  thread_program::{self, accounts::Thread, ThreadProgram},
  ThreadResponse,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct CalculateUtilityPartThreeArgsV0 {
  pub epoch: u64,
}

#[derive(Accounts)]
#[instruction(args: CalculateUtilityPartThreeArgsV0)]
pub struct CalculateUtilityPartThreeV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    mut,
    seeds = ["sub_dao".as_bytes(), sub_dao.dnt_mint.as_ref()],
    bump,
    has_one = dao
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(
    mut,
    seeds = ["dao_epoch_info".as_bytes(), dao.key().as_ref(), &args.epoch.to_le_bytes()],
    bump,
  )]
  pub dao_epoch_info: Box<Account<'info, DaoEpochInfoV0>>,
  #[account(
    mut,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &args.epoch.to_le_bytes()],
    bump,
  )]
  pub sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  pub clock: Sysvar<'info, Clock>,
  pub rent: Sysvar<'info, Rent>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,

  /// CHECK: address checked
  #[account(mut, address = Thread::pubkey(sub_dao.key(), "end-epoch".to_string()))]
  pub thread: AccountInfo<'info>,
  #[account(address = thread_program::ID)]
  pub clockwork: Program<'info, ThreadProgram>,
}

fn construct_next_ix(ctx: &Context<CalculateUtilityPartThreeV0>, epoch: u64) -> Instruction {
  let hnt_circuit_breaker = Pubkey::find_program_address(
    &[
      "mint_windowed_breaker".as_bytes(),
      ctx.accounts.dao.hnt_mint.as_ref(),
    ],
    &crate::id(),
  )
  .0;
  let dnt_circuit_breaker = Pubkey::find_program_address(
    &[
      "mint_windowed_breaker".as_bytes(),
      ctx.accounts.sub_dao.dnt_mint.as_ref(),
    ],
    &crate::id(),
  )
  .0;
  // issue rewards ix
  let accounts = vec![
    AccountMeta::new_readonly(ctx.accounts.dao.key(), false),
    AccountMeta::new_readonly(ctx.accounts.sub_dao.key(), false),
    AccountMeta::new(ctx.accounts.dao_epoch_info.key(), false), // use the current epoch infos
    AccountMeta::new(ctx.accounts.sub_dao_epoch_info.key(), false),
    AccountMeta::new(hnt_circuit_breaker, false),
    AccountMeta::new(dnt_circuit_breaker, false),
    AccountMeta::new(ctx.accounts.dao.hnt_mint, false),
    AccountMeta::new(ctx.accounts.sub_dao.dnt_mint, false),
    AccountMeta::new(ctx.accounts.sub_dao.treasury, false),
    AccountMeta::new(ctx.accounts.sub_dao.rewards_escrow, false),
    AccountMeta::new(ctx.accounts.sub_dao.staker_pool, false),
    AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
    AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
    AccountMeta::new_readonly(ctx.accounts.circuit_breaker_program.key(), false),
    AccountMeta::new_readonly(ctx.accounts.clock.key(), false),
  ];
  Instruction {
    program_id: crate::ID,
    accounts,
    data: crate::instruction::IssueRewardsV0 {
      args: crate::IssueRewardsArgsV0 { epoch },
    }
    .data(),
  }
}

fn construct_kickoff_ix(ctx: &Context<CalculateUtilityPartThreeV0>, epoch: u64) -> Instruction {
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

  // build clockwork kickoff ix
  let accounts = vec![
    AccountMeta::new(ctx.accounts.payer.key(), true),
    AccountMeta::new_readonly(ctx.accounts.dao.key(), false),
    AccountMeta::new(ctx.accounts.sub_dao.key(), false),
    AccountMeta::new(dao_epoch_info, false),
    AccountMeta::new(sub_dao_epoch_info, false),
    AccountMeta::new_readonly(ctx.accounts.clock.key(), false),
    AccountMeta::new_readonly(ctx.accounts.rent.key(), false),
    AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
    AccountMeta::new(ctx.accounts.thread.key(), false),
    AccountMeta::new_readonly(ctx.accounts.clockwork.key(), false),
  ];
  Instruction {
    program_id: crate::ID,
    accounts,
    data: crate::instruction::CalculateUtilityPartOneV0 {
      args: CalculateUtilityPartOneArgsV0 { epoch },
    }
    .data(),
  }
}

pub fn handler(
  ctx: Context<CalculateUtilityPartThreeV0>,
  args: CalculateUtilityPartThreeArgsV0,
) -> Result<ThreadResponse> {
  let curr_ts = ctx.accounts.clock.unix_timestamp;
  let epoch = current_epoch(curr_ts);

  if !TESTING && args.epoch >= epoch {
    return Err(error!(ErrorCode::EpochNotOver));
  }

  if ctx.accounts.sub_dao_epoch_info.calculation_stage != 2 {
    return Err(error!(ErrorCode::IncorrectCalculationStage));
  }

  let epoch_info = &mut ctx.accounts.sub_dao_epoch_info;

  epoch_info.calculation_stage = 3;

  let epoch = current_epoch(curr_ts);

  let kickoff_ix = construct_kickoff_ix(&ctx, epoch);
  let next_ix = construct_next_ix(&ctx, epoch);

  // kickoff ix is using the epoch infos for current epoch. calls part one after this epoch is over
  // next ix is using the epoch infos for previous epoch, which is being processed in the current clockwork thread. calls issue_rewards
  Ok(ThreadResponse {
    kickoff_instruction: Some(kickoff_ix.into()),
    next_instruction: Some(next_ix.into()),
  })
}
