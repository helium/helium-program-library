use anchor_lang::prelude::*;
use tuktuk_program::{
  tuktuk::{
    self,
    cpi::{accounts::DequeueTaskV0, dequeue_task_v0},
    program::Tuktuk,
  },
  TaskQueueAuthorityV0,
};

use crate::{
  errors::ErrorCode, queue_authority_seeds, schedule_impl, MiniFanoutV0, ScheduleTaskArgsV0,
  ScheduleTaskV0,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct UpdateWalletDelegateArgsV0 {
  pub index: u8,
  pub new_task_id: u16,
  pub new_pre_task_id: u16,
  pub delegate: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: UpdateWalletDelegateArgsV0)]
pub struct UpdateWalletDelegateV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub wallet: Signer<'info>,
  #[account(
    mut,
    constraint = mini_fanout.shares.len() > args.index as usize @ ErrorCode::InvalidIndex,
    constraint = mini_fanout.shares[args.index as usize].wallet == wallet.key() @ ErrorCode::InvalidWallet,
    has_one = next_task,
    has_one = next_pre_task,
    has_one = task_queue,
  )]
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
  /// CHECK: new task account
  #[account(mut)]
  pub new_task: UncheckedAccount<'info>,
  /// CHECK: next pre task account
  #[account(mut)]
  pub next_pre_task: UncheckedAccount<'info>,
  /// CHECK: new pre task account
  #[account(mut)]
  pub new_pre_task: UncheckedAccount<'info>,
  pub tuktuk_program: Program<'info, Tuktuk>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<UpdateWalletDelegateV0>,
  args: UpdateWalletDelegateArgsV0,
) -> Result<()> {
  let mini_fanout = &mut ctx.accounts.mini_fanout;
  mini_fanout.shares[args.index as usize].delegate = args.delegate;
  if !ctx.accounts.next_task.data_is_empty() {
    dequeue_task_v0(CpiContext::new_with_signer(
      ctx.accounts.tuktuk_program.to_account_info(),
      DequeueTaskV0 {
        task_queue: ctx.accounts.task_queue.to_account_info(),
        task: ctx.accounts.next_task.to_account_info(),
        queue_authority: ctx.accounts.queue_authority.to_account_info(),
        rent_refund: ctx.accounts.payer.to_account_info(),
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

  mini_fanout.next_task = ctx.accounts.new_task.key();
  mini_fanout.next_pre_task = ctx.accounts.new_pre_task.key();
  Ok(())
}
