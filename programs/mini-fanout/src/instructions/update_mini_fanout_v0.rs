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
  errors::ErrorCode, queue_authority_seeds, schedule_impl, schedule_task_v0::ScheduleTaskV0,
  state::*, MiniFanoutShareArgV0, ScheduleTaskArgsV0, MAX_SHARES,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct UpdateMiniFanoutArgsV0 {
  pub new_task_id: u16,
  pub new_pre_task_id: u16,
  pub shares: Option<Vec<MiniFanoutShareArgV0>>,
  pub schedule: Option<String>,
}

#[derive(Accounts)]
#[instruction(args: UpdateMiniFanoutArgsV0)]
pub struct UpdateMiniFanoutV0<'info> {
  pub owner: Signer<'info>,
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(mut, has_one = owner, has_one = next_task, has_one = task_queue, has_one = next_pre_task)]
  pub mini_fanout: Box<Account<'info, MiniFanoutV0>>,
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
  pub next_pre_task: UncheckedAccount<'info>,
  /// CHECK: new task account
  #[account(mut)]
  pub new_task: UncheckedAccount<'info>,
  /// CHECK: new pre task account
  #[account(mut)]
  pub new_pre_task: UncheckedAccount<'info>,
  /// CHECK: task rent refund account
  #[account(mut)]
  pub task_rent_refund: UncheckedAccount<'info>,
  pub tuktuk_program: Program<'info, Tuktuk>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<UpdateMiniFanoutV0>, args: UpdateMiniFanoutArgsV0) -> Result<()> {
  let mini_fanout = &mut ctx.accounts.mini_fanout;
  if let Some(shares) = args.shares {
    require_gte!(shares.len(), 1, ErrorCode::InvalidShares);
    require_gte!(MAX_SHARES, shares.len(), ErrorCode::InvalidShares);
    mini_fanout.shares = shares
      .into_iter()
      .map(|s| {
        let existing_share = mini_fanout
          .shares
          .iter()
          .find(|share| share.wallet == s.wallet);
        MiniFanoutShareV0 {
          wallet: s.wallet,
          share: s.share,
          delegate: existing_share
            .map(|s| s.delegate)
            .unwrap_or(Pubkey::default()),
          total_dust: existing_share.map(|s| s.total_dust).unwrap_or(0),
          total_owed: existing_share.map(|s| s.total_owed).unwrap_or(0),
        }
      })
      .collect()
  }
  if let Some(schedule) = args.schedule {
    Schedule::from_str(&schedule).map_err(|e| {
      msg!("Invalid schedule {}", e);
      crate::errors::ErrorCode::InvalidSchedule
    })?;
    mini_fanout.schedule = schedule;
  }
  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    mini_fanout,
  )?;
  if !ctx.accounts.next_task.data_is_empty() && ctx.accounts.next_task.key() != mini_fanout.key() {
    dequeue_task_v0(CpiContext::new_with_signer(
      ctx.accounts.tuktuk_program.to_account_info(),
      DequeueTaskV0 {
        task_queue: ctx.accounts.task_queue.to_account_info(),
        task: ctx.accounts.next_task.to_account_info(),
        queue_authority: ctx.accounts.queue_authority.to_account_info(),
        rent_refund: ctx.accounts.task_rent_refund.to_account_info(),
        task_queue_authority: ctx.accounts.task_queue_authority.to_account_info(),
      },
      &[queue_authority_seeds!(mini_fanout)],
    ))?;
  }
  if !ctx.accounts.next_pre_task.data_is_empty()
    && ctx.accounts.next_pre_task.key() != mini_fanout.key()
  {
    dequeue_task_v0(CpiContext::new_with_signer(
      ctx.accounts.tuktuk_program.to_account_info(),
      DequeueTaskV0 {
        task_queue: ctx.accounts.task_queue.to_account_info(),
        task: ctx.accounts.next_pre_task.to_account_info(),
        queue_authority: ctx.accounts.queue_authority.to_account_info(),
        rent_refund: ctx.accounts.task_rent_refund.to_account_info(),
        task_queue_authority: ctx.accounts.task_queue_authority.to_account_info(),
      },
      &[queue_authority_seeds!(mini_fanout)],
    ))?;
  }

  schedule_impl(
    &mut ScheduleTaskV0 {
      payer: ctx.accounts.payer.clone(),
      mini_fanout: mini_fanout.clone(),
      next_task: ctx.accounts.next_task.clone(),
      tuktuk_program: ctx.accounts.tuktuk_program.clone(),
      queue_authority: ctx.accounts.queue_authority.clone(),
      task_queue_authority: ctx.accounts.task_queue_authority.clone(),
      task_queue: ctx.accounts.task_queue.clone(),
      system_program: ctx.accounts.system_program.clone(),
      task: ctx.accounts.new_task.clone(),
      next_pre_task: ctx.accounts.next_pre_task.clone(),
      pre_task: ctx.accounts.new_pre_task.clone(),
    },
    ScheduleTaskArgsV0 {
      task_id: args.new_task_id,
      pre_task_id: args.new_pre_task_id,
    },
  )?;

  if mini_fanout.pre_task.is_some() {
    mini_fanout.next_pre_task = ctx.accounts.new_pre_task.key();
  }
  mini_fanout.next_task = ctx.accounts.new_task.key();

  Ok(())
}
