use anchor_lang::prelude::*;
use tuktuk_program::{
  tuktuk::{
    self,
    cpi::{accounts::DequeueTaskV0, dequeue_task_v0},
    program::Tuktuk,
  },
  TaskQueueAuthorityV0, TaskV0,
};

use crate::{queue_authority_seeds, state::*};

#[derive(Accounts)]
pub struct CloseMiniFanoutV0<'info> {
  #[account(mut)]
  pub owner: Signer<'info>,
  #[account(
    mut,
    close = rent_refund,
    has_one = rent_refund,
    has_one = owner,
    has_one = next_task,
    has_one = next_pre_task,
    has_one = task_queue
  )]
  pub mini_fanout: Box<Account<'info, MiniFanoutV0>>,
  /// CHECK: queue authority
  #[account(
    seeds = [b"queue_authority"],
    bump = mini_fanout.queue_authority_bump,
  )]
  pub queue_authority: UncheckedAccount<'info>,
  /// CHECK: task queue authority
  #[account(
    seeds = [b"task_queue_authority", task_queue.key().as_ref(), queue_authority.key().as_ref()],
    bump = task_queue_authority.bump_seed,
    seeds::program = tuktuk::ID,
  )]
  pub task_queue_authority: Box<Account<'info, TaskQueueAuthorityV0>>,
  #[account(mut)]
  pub rent_refund: SystemAccount<'info>,
  /// CHECK: task queue account
  #[account(mut)]
  pub task_queue: UncheckedAccount<'info>,
  /// CHECK: current task account
  #[account(mut)]
  pub next_task: Box<Account<'info, TaskV0>>,
  /// CHECK: current pre-task account
  #[account(mut)]
  pub next_pre_task: Box<Account<'info, TaskV0>>,
  pub tuktuk_program: Program<'info, Tuktuk>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CloseMiniFanoutV0>) -> Result<()> {
  dequeue_task_v0(CpiContext::new_with_signer(
    ctx.accounts.tuktuk_program.to_account_info(),
    DequeueTaskV0 {
      task_queue: ctx.accounts.task_queue.to_account_info(),
      task: ctx.accounts.next_task.to_account_info(),
      queue_authority: ctx.accounts.queue_authority.to_account_info(),
      rent_refund: if ctx.accounts.next_task.rent_refund == ctx.accounts.rent_refund.key() {
        ctx.accounts.rent_refund.to_account_info()
      } else {
        ctx.accounts.task_queue.to_account_info()
      },
      task_queue_authority: ctx.accounts.task_queue_authority.to_account_info(),
    },
    &[queue_authority_seeds!(ctx.accounts.mini_fanout)],
  ))?;
  dequeue_task_v0(CpiContext::new_with_signer(
    ctx.accounts.tuktuk_program.to_account_info(),
    DequeueTaskV0 {
      task_queue: ctx.accounts.task_queue.to_account_info(),
      task: ctx.accounts.next_pre_task.to_account_info(),
      queue_authority: ctx.accounts.queue_authority.to_account_info(),
      rent_refund: if ctx.accounts.next_pre_task.rent_refund == ctx.accounts.rent_refund.key() {
        ctx.accounts.rent_refund.to_account_info()
      } else {
        ctx.accounts.task_queue.to_account_info()
      },
      task_queue_authority: ctx.accounts.task_queue_authority.to_account_info(),
    },
    &[queue_authority_seeds!(ctx.accounts.mini_fanout)],
  ))?;
  Ok(())
}
