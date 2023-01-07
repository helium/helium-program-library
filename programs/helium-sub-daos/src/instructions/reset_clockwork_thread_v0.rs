use crate::{create_end_epoch_cron, current_epoch, state::*};
use anchor_lang::{prelude::*, solana_program::instruction::Instruction, InstructionData};
use anchor_spl::token::Token;
use circuit_breaker::CircuitBreaker;
use clockwork_sdk::{
  cpi::thread_update,
  state::{Thread, ThreadSettings, Trigger},
  utils::PAYER_PUBKEY,
  ThreadProgram,
};

#[derive(Accounts)]
#[instruction()]
pub struct ResetClockworkThreadV0<'info> {
  #[account(mut)]
  pub authority: Signer<'info>,

  pub dao: Box<Account<'info, DaoV0>>,

  #[account(
    mut,
    has_one = authority,
    has_one = dao,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  /// CHECK: add
  #[account(
    mut,
    seeds = [b"thread", sub_dao.key().as_ref(), b"end-epoch"],
    seeds::program = clockwork.key(),
    bump
  )]
  pub thread: Account<'info, Thread>,
  pub clockwork: Program<'info, ThreadProgram>,

  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
}

pub fn handler(ctx: Context<ResetClockworkThreadV0>) -> Result<()> {
  let curr_ts = Clock::get()?.unix_timestamp;
  let epoch = current_epoch(curr_ts);

  // get the epoch info keys
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
    AccountMeta::new(PAYER_PUBKEY, true),
    AccountMeta::new_readonly(ctx.accounts.dao.key(), false),
    AccountMeta::new(ctx.accounts.sub_dao.key(), false),
    AccountMeta::new(dao_epoch_info, false),
    AccountMeta::new(sub_dao_epoch_info, false),
    AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
    AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
    AccountMeta::new_readonly(ctx.accounts.circuit_breaker_program.key(), false),
    AccountMeta::new(ctx.accounts.thread.key(), false),
    AccountMeta::new_readonly(ctx.accounts.clockwork.key(), false),
  ];
  let kickoff_ix = Instruction {
    program_id: crate::ID,
    accounts,
    data: crate::instruction::CalculateUtilityScoreV0 {
      args: crate::CalculateUtilityScoreArgsV0 { epoch },
    }
    .data(),
  };

  let cron = create_end_epoch_cron(curr_ts, 60 * 5);

  let signer_seeds: &[&[&[u8]]] = &[&[
    "sub_dao".as_bytes(),
    ctx.accounts.sub_dao.dnt_mint.as_ref(),
    &[ctx.accounts.sub_dao.bump_seed],
  ]];
  thread_update(
    CpiContext::new_with_signer(
      ctx.accounts.clockwork.to_account_info(),
      clockwork_sdk::cpi::ThreadUpdate {
        authority: ctx.accounts.sub_dao.to_account_info(),
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
