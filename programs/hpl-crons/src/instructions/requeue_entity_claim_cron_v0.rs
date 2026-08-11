use std::cmp::max;

use anchor_lang::{prelude::*, InstructionData};
use spl_token::solana_program::instruction::Instruction;
use tuktuk_program::{
  compile_transaction,
  cron::{accounts::CronJobV0, client::accounts::QueueCronTasksV0, program::Cron},
  tuktuk::{
    cpi::{accounts::QueueTaskV0, queue_task_v0},
    program::Tuktuk,
  },
  types::QueueTaskArgsV0,
  TaskQueueAuthorityV0, TaskQueueV0, TransactionSourceV0, TriggerV0,
};

use crate::error::ErrorCode;

#[derive(Accounts)]
pub struct RequeueEntityClaimCronV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    seeds = [b"queue_authority"],
    bump,
  )]
  /// CHECK: Via seeds
  pub queue_authority: AccountInfo<'info>,
  #[account(
        seeds = [b"task_queue_authority", task_queue.key().as_ref(), queue_authority.key().as_ref()],
        bump = task_queue_authority.bump_seed,
        seeds::program = tuktuk_program.key(),
    )]
  pub task_queue_authority: Box<Account<'info, TaskQueueAuthorityV0>>,
  pub user_authority: Signer<'info>,
  #[account(
    seeds = [b"entity_cron_authority", user_authority.key().as_ref()],
    bump,
  )]
  /// CHECK: Via seeds
  pub authority: AccountInfo<'info>,
  #[account(
    mut,
    seeds = [b"user_cron_jobs", authority.key().as_ref()],
    bump,
    seeds::program = cron_program.key(),
  )]
  /// CHECK: Via CPI
  pub user_cron_jobs: UncheckedAccount<'info>,
  #[account(
    mut,
    has_one = authority,
    constraint = cron_job.removed_from_queue @ ErrorCode::CronJobNotRemovedFromQueue,
  )]
  pub cron_job: Account<'info, CronJobV0>,
  #[account(mut)]
  /// CHECK: Via CPI
  pub cron_job_name_mapping: AccountInfo<'info>,
  #[account(mut)]
  pub task_queue: Box<Account<'info, TaskQueueV0>>,
  /// CHECK: Initialized in CPI
  #[account(mut)]
  pub task: AccountInfo<'info>,
  /// CHECK: Used to write return data
  #[account(
    seeds = [b"task_return_account_1", cron_job.key().as_ref()],
    bump,
    seeds::program = cron_program.key()
  )]
  pub task_return_account_1: AccountInfo<'info>,
  /// CHECK: Used to write return data
  #[account(
    seeds = [b"task_return_account_2", cron_job.key().as_ref()],
    bump,
    seeds::program = cron_program.key()
  )]
  pub task_return_account_2: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
  pub tuktuk_program: Program<'info, Tuktuk>,
  pub cron_program: Program<'info, Cron>,
}

/// The address of one of a cron job's transaction records. The records belong to the cron
/// program, so they are derived under it -- the same address `add_entity_to_cron_v0` reaches
/// with `seeds::program = cron_program`.
fn cron_job_transaction_key(cron_job: &Pubkey, index: u32) -> Pubkey {
  Pubkey::find_program_address(
    &[
      b"cron_job_transaction",
      cron_job.as_ref(),
      &index.to_le_bytes(),
    ],
    &tuktuk_program::cron::ID,
  )
  .0
}

/// The records a schedule run reads: one per transaction the run will queue, starting where the
/// job's execution left off.
fn records_to_queue(cron_job: &Pubkey, from: u32, count: u8) -> Vec<Pubkey> {
  (from..from + count as u32)
    .map(|i| cron_job_transaction_key(cron_job, i))
    .collect()
}

pub fn handler(ctx: Context<RequeueEntityClaimCronV0>) -> Result<()> {
  let remaining_accounts = records_to_queue(
    &ctx.accounts.cron_job.key(),
    ctx.accounts.cron_job.current_transaction_id,
    ctx.accounts.cron_job.num_tasks_per_queue_call,
  );
  let (queue_tx, _) = compile_transaction(
    vec![Instruction {
      program_id: tuktuk_program::cron::ID,
      accounts: [
        QueueCronTasksV0 {
          cron_job: ctx.accounts.cron_job.key(),
          task_queue: ctx.accounts.task_queue.key(),
          task_return_account_1: ctx.accounts.task_return_account_1.key(),
          task_return_account_2: ctx.accounts.task_return_account_2.key(),
          system_program: ctx.accounts.system_program.key(),
        }
        .to_account_metas(None),
        remaining_accounts
          .iter()
          .map(|pubkey| AccountMeta::new_readonly(*pubkey, false))
          .collect::<Vec<AccountMeta>>(),
      ]
      .concat(),
      data: tuktuk_program::cron::client::args::QueueCronTasksV0 {}.data(),
    }],
    vec![],
  )?;

  let trunc_name = ctx
    .accounts
    .cron_job
    .name
    .chars()
    .take(32)
    .collect::<String>();
  queue_task_v0(
    CpiContext::new_with_signer(
      ctx.accounts.tuktuk_program.to_account_info(),
      QueueTaskV0 {
        payer: ctx.accounts.payer.to_account_info(),
        queue_authority: ctx.accounts.queue_authority.to_account_info(),
        task_queue_authority: ctx.accounts.task_queue_authority.to_account_info(),
        task_queue: ctx.accounts.task_queue.to_account_info(),
        task: ctx.accounts.task.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
      },
      &[&[b"queue_authority", &[ctx.bumps.queue_authority]]],
    ),
    QueueTaskArgsV0 {
      trigger: TriggerV0::Timestamp(max(
        Clock::get()?.unix_timestamp,
        ctx.accounts.cron_job.current_exec_ts - 60 * 5,
      )),
      transaction: TransactionSourceV0::CompiledV0(queue_tx),
      crank_reward: None,
      free_tasks: ctx.accounts.cron_job.num_tasks_per_queue_call + 1,
      id: ctx.accounts.task_queue.next_available_task_id().unwrap(),
      description: format!("queue {}", trunc_name),
    },
  )?;

  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn a_schedule_run_reads_the_records_its_execution_left_off_at() {
    let cron_job = Pubkey::new_unique();

    let records = records_to_queue(&cron_job, 3, 4);

    assert_eq!(records.len(), 4, "one record per transaction to queue");
    assert_eq!(
      records,
      (3..7)
        .map(|i| cron_job_transaction_key(&cron_job, i))
        .collect::<Vec<_>>(),
      "the records are ids 3..7, in order"
    );
    // Named against the derivation rather than against the helper, so the list is pinned to the
    // cron program even if the helper stops deriving it there.
    assert_eq!(
      records[0],
      Pubkey::find_program_address(
        &[
          b"cron_job_transaction",
          cron_job.as_ref(),
          &3u32.to_le_bytes()
        ],
        &tuktuk_program::cron::ID,
      )
      .0
    );
  }

  #[test]
  fn a_transaction_record_is_derived_under_the_cron_program() {
    let cron_job = Pubkey::new_unique();

    for index in [0u32, 1, 7, 999] {
      let seeds = [
        b"cron_job_transaction".as_ref(),
        cron_job.as_ref(),
        &index.to_le_bytes(),
      ];
      let key = cron_job_transaction_key(&cron_job, index);

      assert_eq!(
        key,
        Pubkey::find_program_address(&seeds, &tuktuk_program::cron::ID).0,
        "index {index}"
      );
      // Pinned against this program's id, the other one these seeds could be derived under.
      assert_ne!(
        key,
        Pubkey::find_program_address(&seeds, &crate::ID).0,
        "index {index}"
      );
    }
  }
}
