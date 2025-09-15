use std::str::FromStr;

use anchor_lang::{prelude::*, InstructionData};
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
  distribute_v0::__client_accounts_distribute_v0::DistributeV0, queue_authority_seeds, state::*,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ScheduleTaskArgsV0 {
  pub task_id: u16,
  pub pre_task_id: u16,
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
    has_one = next_pre_task,
  )]
  pub mini_fanout: Box<Account<'info, MiniFanoutV0>>,
  /// CHECK: Via constraint
  /// Only allow one task to be scheduled at a time
  #[account(
    constraint = next_task.data_is_empty() || next_task.key() == Pubkey::default() || next_task.key() == crate::ID
  )]
  pub next_task: UncheckedAccount<'info>,
  /// CHECK: Via constraint
  /// Only allow one task to be scheduled at a time
  #[account(
    constraint = next_pre_task.data_is_empty() || next_pre_task.key() == Pubkey::default() || next_pre_task.key() == crate::ID
  )]
  pub next_pre_task: UncheckedAccount<'info>,
  /// CHECK: queue authority
  #[account(
    seeds = [b"queue_authority"],
    bump = mini_fanout.queue_authority_bump,
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
  pub pre_task: UncheckedAccount<'info>,
  pub tuktuk_program: Program<'info, Tuktuk>,
  pub system_program: Program<'info, System>,
}

pub fn get_task_ix(mini_fanout: &Account<MiniFanoutV0>) -> Result<CompiledTransactionV0> {
  // Construct the transaction to call distributeV0 on this program
  let mut distribute_accounts = DistributeV0 {
    mini_fanout: mini_fanout.key(),
    token_account: mini_fanout.token_account,
    token_program: spl_token::ID,
    task_queue: mini_fanout.task_queue,
    next_task: mini_fanout.next_task,
    next_pre_task: mini_fanout.next_pre_task,
  }
  .to_account_metas(None);

  // Append all shareholder token accounts as writable, non-signer
  for share in &mini_fanout.shares {
    let ata = anchor_spl::associated_token::get_associated_token_address(
      &share.destination(),
      &mini_fanout.mint,
    );
    distribute_accounts.push(anchor_lang::solana_program::instruction::AccountMeta {
      pubkey: ata,
      is_signer: false,
      is_writable: true,
    });
  }

  let distribute_ix = anchor_lang::solana_program::instruction::Instruction {
    program_id: crate::ID,
    accounts: distribute_accounts,
    data: crate::instruction::DistributeV0 {}.data(),
  };

  // Compile the transaction (no signers, just the instruction)
  let (compiled_tx, _) = tuktuk_program::compile_transaction(vec![distribute_ix], vec![])?;

  Ok(compiled_tx)
}

pub fn get_next_time(mini_fanout: &MiniFanoutV0) -> Result<i64> {
  let schedule = Schedule::from_str(&mini_fanout.schedule)
    .map_err(|_| crate::errors::ErrorCode::InvalidDataIncrease)?;
  let ts = Clock::get().unwrap().unix_timestamp;
  let now = &DateTime::<Utc>::from_naive_utc_and_offset(
    DateTime::from_timestamp(ts, 0).unwrap().naive_utc(),
    Utc,
  );
  Ok(
    schedule
      .after(now)
      .next()
      .ok_or(crate::errors::ErrorCode::InvalidDataIncrease)?
      .timestamp(),
  )
}

pub fn schedule_impl(ctx: &mut ScheduleTaskV0, args: ScheduleTaskArgsV0) -> Result<()> {
  let mini_fanout = &mut ctx.mini_fanout;
  let next_time = get_next_time(mini_fanout)?;
  mini_fanout.next_task = ctx.task.key();

  // CPI to tuktuk to queue the tasks
  if let Some(pre_task) = mini_fanout.pre_task.clone() {
    mini_fanout.next_pre_task = ctx.pre_task.key();
    queue_task_v0(
      CpiContext::new_with_signer(
        ctx.tuktuk_program.to_account_info(),
        QueueTaskV0 {
          payer: ctx.payer.to_account_info(),
          queue_authority: ctx.queue_authority.to_account_info(),
          task_queue_authority: ctx.task_queue_authority.to_account_info(),
          task_queue: ctx.task_queue.to_account_info(),
          task: ctx.pre_task.to_account_info(),
          system_program: ctx.system_program.to_account_info(),
        },
        &[queue_authority_seeds!(mini_fanout)],
      ),
      QueueTaskArgsV0 {
        trigger: TriggerV0::Timestamp(next_time - 1),
        transaction: pre_task,
        crank_reward: None,
        free_tasks: 0,
        id: args.pre_task_id,
        description: format!(
          "pre dist {}",
          &mini_fanout.key().to_string()[..(32 - 9 - 4)]
        ),
      },
    )?;
  }

  let compiled_tx = get_task_ix(mini_fanout)?;
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
      &[queue_authority_seeds!(mini_fanout)],
    ),
    QueueTaskArgsV0 {
      trigger: TriggerV0::Timestamp(next_time),
      transaction: TransactionSourceV0::CompiledV0(compiled_tx),
      crank_reward: None,
      free_tasks: 2,
      id: args.task_id,
      description: format!("dist {}", &mini_fanout.key().to_string()[..(32 - 9)]),
    },
  )?;

  Ok(())
}

pub fn handler(ctx: Context<ScheduleTaskV0>, args: ScheduleTaskArgsV0) -> Result<()> {
  let ctx = ctx.accounts;
  schedule_impl(ctx, args)
}
