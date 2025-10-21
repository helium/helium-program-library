use std::str::FromStr;

use anchor_lang::prelude::*;
use clockwork_cron::Schedule;
use shared_utils::resize_to_fit;
use tuktuk_program::{
  tuktuk::{
    self,
    cpi::{accounts::DequeueTaskV0, dequeue_task_v0},
    program::Tuktuk,
  },
  TaskQueueAuthorityV0,
};

use crate::{
  queue_authority_seeds, schedule_impl, schedule_task_v0::ScheduleTaskV0, state::*,
  ScheduleTaskArgsV0,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct UpdateAutoTopOffArgsV0 {
  pub new_task_id: u16,
  pub new_pyth_task_id: u16,
  pub schedule: Option<String>,
  pub threshold: Option<u64>,
}

#[derive(Accounts)]
#[instruction(args: UpdateAutoTopOffArgsV0)]
pub struct UpdateAutoTopOffV0<'info> {
  pub authority: Signer<'info>,
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(mut, has_one = authority, has_one = next_task, has_one = task_queue, has_one = next_pyth_task)]
  pub auto_top_off: Box<Account<'info, AutoTopOffV0>>,
  /// CHECK: queue authority
  #[account(
    seeds = [b"queue_authority"],
    bump
  )]
  pub queue_authority: UncheckedAccount<'info>,
  /// CHECK: task queue authority
  #[account(
    seeds = [b"task_queue_authority", task_queue.key().as_ref(), queue_authority.key().as_ref()],
    bump = task_queue_authority.bump_seed,
    seeds::program = tuktuk::ID,
  )]
  pub task_queue_authority: Box<Account<'info, TaskQueueAuthorityV0>>,
  /// CHECK: task queue account
  #[account(mut)]
  pub task_queue: UncheckedAccount<'info>,
  /// CHECK: current task account
  #[account(mut)]
  pub next_task: UncheckedAccount<'info>,
  /// CHECK: next pre task account
  #[account(mut)]
  pub next_pyth_task: UncheckedAccount<'info>,
  /// CHECK: new task account
  #[account(mut)]
  pub new_task: UncheckedAccount<'info>,
  /// CHECK: task rent refund account
  #[account(mut)]
  pub task_rent_refund: UncheckedAccount<'info>,
  /// CHECK: pyth task rent refund account
  #[account(mut)]
  pub pyth_task_rent_refund: UncheckedAccount<'info>,
  /// CHECK: new pre task account
  #[account(mut)]
  pub new_pyth_task: UncheckedAccount<'info>,
  pub tuktuk_program: Program<'info, Tuktuk>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<UpdateAutoTopOffV0>, args: UpdateAutoTopOffArgsV0) -> Result<()> {
  let auto_top_off = &mut ctx.accounts.auto_top_off;
  if let Some(schedule) = args.schedule {
    Schedule::from_str(&schedule).map_err(|e| {
      msg!("Invalid schedule {}", e);
      crate::errors::ErrorCode::InvalidSchedule
    })?;
    auto_top_off.schedule = schedule;
  }
  if let Some(threshold) = args.threshold {
    auto_top_off.threshold = threshold;
  }
  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    auto_top_off,
  )?;
  if !ctx.accounts.next_task.data_is_empty() {
    dequeue_task_v0(CpiContext::new_with_signer(
      ctx.accounts.tuktuk_program.to_account_info(),
      DequeueTaskV0 {
        task_queue: ctx.accounts.task_queue.to_account_info(),
        task: ctx.accounts.next_task.to_account_info(),
        queue_authority: ctx.accounts.queue_authority.to_account_info(),
        rent_refund: ctx.accounts.task_rent_refund.to_account_info(),
        task_queue_authority: ctx.accounts.task_queue_authority.to_account_info(),
      },
      &[queue_authority_seeds!(auto_top_off)],
    ))?;
  }
  if !ctx.accounts.next_pyth_task.data_is_empty() {
    dequeue_task_v0(CpiContext::new_with_signer(
      ctx.accounts.tuktuk_program.to_account_info(),
      DequeueTaskV0 {
        task_queue: ctx.accounts.task_queue.to_account_info(),
        task: ctx.accounts.next_pyth_task.to_account_info(),
        queue_authority: ctx.accounts.queue_authority.to_account_info(),
        rent_refund: ctx.accounts.pyth_task_rent_refund.to_account_info(),
        task_queue_authority: ctx.accounts.task_queue_authority.to_account_info(),
      },
      &[queue_authority_seeds!(auto_top_off)],
    ))?;
  }

  schedule_impl(
    &mut ScheduleTaskV0 {
      payer: ctx.accounts.payer.clone(),
      auto_top_off: auto_top_off.clone(),
      next_task: ctx.accounts.next_task.clone(),
      tuktuk_program: ctx.accounts.tuktuk_program.clone(),
      queue_authority: ctx.accounts.queue_authority.clone(),
      task_queue_authority: ctx.accounts.task_queue_authority.clone(),
      task_queue: ctx.accounts.task_queue.clone(),
      system_program: ctx.accounts.system_program.clone(),
      task: ctx.accounts.new_task.clone(),
      pyth_task: ctx.accounts.new_pyth_task.clone(),
    },
    ScheduleTaskArgsV0 {
      task_id: args.new_task_id,
      pyth_task_id: args.new_pyth_task_id,
    },
  )?;

  auto_top_off.next_task = ctx.accounts.new_task.key();
  auto_top_off.next_pyth_task = ctx.accounts.new_pyth_task.key();

  Ok(())
}
