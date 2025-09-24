use std::str::FromStr;

use anchor_lang::{
  prelude::*,
  solana_program::{system_program, sysvar::instructions::ID as IX_ID},
  InstructionData,
};
use anchor_spl::token::spl_token;
use chrono::{DateTime, Utc};
use clockwork_cron::Schedule;
use tuktuk_program::{
  tuktuk::{
    self,
    cpi::{accounts::QueueTaskV0, queue_task_v0},
    program::Tuktuk,
  },
  types::{QueueTaskArgsV0, TransactionSourceV0, TriggerV0},
  CompiledTransactionV0, TaskQueueAuthorityV0,
};

use crate::{
  queue_authority_seeds, state::*, ASSOCIATED_TOKEN_PROGRAM_ID, TUKTUK_PYTH_SIGNER, TUKTUK_PYTH_URL,
};

const HNT_PRICE_ORACLE: Pubkey = pubkey!("4DdmDswskDxXGpwHrXUfn2CNUm9rt21ac79GHNTN3J33");

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ScheduleTaskArgsV0 {
  pub task_id: u16,
  pub pyth_task_id: u16,
}

#[derive(Accounts)]
#[instruction(args: ScheduleTaskArgsV0)]
pub struct ScheduleTaskV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    mut,
    has_one = next_task,
    has_one = task_queue,
  )]
  pub auto_top_off: Box<Account<'info, AutoTopOffV0>>,
  /// CHECK: Via constraint
  /// Only allow one task to be scheduled at a time
  #[account(
    constraint = next_task.data_is_empty() || next_task.key() == auto_top_off.key()
  )]
  pub next_task: UncheckedAccount<'info>,
  /// CHECK: queue authority
  #[account(
    seeds = [b"queue_authority"],
    bump = auto_top_off.queue_authority_bump,
  )]
  pub queue_authority: UncheckedAccount<'info>,
  #[account(
    seeds = [b"task_queue_authority", task_queue.key().as_ref(), queue_authority.key().as_ref()],
    bump = task_queue_authority.bump_seed,
    seeds::program = tuktuk::ID,
  )]
  pub task_queue_authority: Box<Account<'info, TaskQueueAuthorityV0>>,
  /// CHECK: task queue account
  #[account(mut)]
  pub task_queue: UncheckedAccount<'info>,
  /// CHECK: task account to be created
  #[account(mut)]
  pub task: UncheckedAccount<'info>,
  /// CHECK: task account to be created
  #[account(mut)]
  pub pyth_task: UncheckedAccount<'info>,
  pub tuktuk_program: Program<'info, Tuktuk>,
  pub system_program: Program<'info, System>,
}

pub fn get_task_ix(auto_top_off: &Account<AutoTopOffV0>) -> Result<CompiledTransactionV0> {
  // Construct the transaction to call distributeV0 on this program
  let distribute_accounts = crate::__client_accounts_top_off_v0::TopOffV0 {
    auto_top_off: auto_top_off.key(),
    data_credits: auto_top_off.data_credits,
    sub_dao: auto_top_off.sub_dao,
    token_program: spl_token::ID,
    task_queue: auto_top_off.task_queue,
    delegated_data_credits: auto_top_off.delegated_data_credits,
    dc_mint: auto_top_off.dc_mint,
    hnt_mint: auto_top_off.hnt_mint,
    dao: auto_top_off.dao,
    from_account: auto_top_off.dc_account,
    from_hnt_account: auto_top_off.hnt_account,
    hnt_price_oracle: HNT_PRICE_ORACLE,
    escrow_account: auto_top_off.escrow_account,
    circuit_breaker: auto_top_off.circuit_breaker,
    associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
    system_program: system_program::ID,
    circuit_breaker_program: circuit_breaker::ID,
    data_credits_program: data_credits::ID,
    instruction_sysvar: IX_ID,
  }
  .to_account_metas(None);

  let top_off_ix = anchor_lang::solana_program::instruction::Instruction {
    program_id: crate::ID,
    accounts: distribute_accounts,
    data: crate::instruction::TopOffV0 {}.data(),
  };

  // Compile the transaction (no signers, just the instruction)
  let (compiled_tx, _) = tuktuk_program::compile_transaction(vec![top_off_ix], vec![])?;

  Ok(compiled_tx)
}

pub fn get_next_time(auto_top_off: &AutoTopOffV0) -> Result<i64> {
  let schedule = Schedule::from_str(&auto_top_off.schedule)
    .map_err(|_| crate::errors::ErrorCode::InvalidSchedule)?;
  let ts = Clock::get().unwrap().unix_timestamp;
  let now = &DateTime::<Utc>::from_naive_utc_and_offset(
    DateTime::from_timestamp(ts, 0).unwrap().naive_utc(),
    Utc,
  );
  Ok(
    schedule
      .after(now)
      .next()
      .ok_or(crate::errors::ErrorCode::InvalidSchedule)?
      .timestamp(),
  )
}

pub fn schedule_impl(ctx: &mut ScheduleTaskV0, args: ScheduleTaskArgsV0) -> Result<()> {
  let auto_top_off = &mut ctx.auto_top_off;
  let next_time = get_next_time(auto_top_off)?;
  auto_top_off.next_task = ctx.task.key();

  auto_top_off.next_pyth_task = ctx.pyth_task.key();
  queue_task_v0(
    CpiContext::new_with_signer(
      ctx.tuktuk_program.to_account_info(),
      QueueTaskV0 {
        payer: ctx.payer.to_account_info(),
        queue_authority: ctx.queue_authority.to_account_info(),
        task_queue_authority: ctx.task_queue_authority.to_account_info(),
        task_queue: ctx.task_queue.to_account_info(),
        task: ctx.pyth_task.to_account_info(),
        system_program: ctx.system_program.to_account_info(),
      },
      &[queue_authority_seeds!(auto_top_off)],
    ),
    QueueTaskArgsV0 {
      trigger: TriggerV0::Timestamp(next_time - 60),
      transaction: TransactionSourceV0::RemoteV0 {
        signer: TUKTUK_PYTH_SIGNER,
        url: format!("{}/{}", TUKTUK_PYTH_URL, auto_top_off.hnt_price_oracle),
      },
      crank_reward: None,
      free_tasks: 1,
      id: args.pyth_task_id,
      description: format!(
        "pyth dist {}",
        &auto_top_off.key().to_string()[..(32 - 11 - 4)]
      ),
    },
  )?;

  let compiled_tx = get_task_ix(auto_top_off)?;
  queue_task_v0(
    CpiContext::new_with_signer(
      ctx.tuktuk_program.to_account_info(),
      QueueTaskV0 {
        payer: ctx.payer.to_account_info(),
        queue_authority: ctx.queue_authority.to_account_info(),
        task_queue_authority: ctx.task_queue_authority.to_account_info(),
        task_queue: ctx.task_queue.to_account_info(),
        task: ctx.task.to_account_info(),
        system_program: ctx.system_program.to_account_info(),
      },
      &[queue_authority_seeds!(auto_top_off)],
    ),
    QueueTaskArgsV0 {
      trigger: TriggerV0::Timestamp(next_time),
      transaction: TransactionSourceV0::CompiledV0(compiled_tx),
      crank_reward: None,
      free_tasks: 2,
      id: args.task_id,
      description: format!("topoff {}", &auto_top_off.key().to_string()[..(32 - 11)]),
    },
  )?;

  Ok(())
}

pub fn handler(ctx: Context<ScheduleTaskV0>, args: ScheduleTaskArgsV0) -> Result<()> {
  let ctx = ctx.accounts;
  schedule_impl(ctx, args)
}
