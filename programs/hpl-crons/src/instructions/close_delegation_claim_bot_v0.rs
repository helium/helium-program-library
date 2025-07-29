use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};
use helium_sub_daos::{try_from, DelegatedPositionV0};
use tuktuk_program::{
  tuktuk::{
    cpi::{accounts::DequeueTaskV0, dequeue_task_v0},
    program::Tuktuk,
  },
  TaskQueueAuthorityV0, TaskQueueV0, TaskV0,
};
use voter_stake_registry::state::PositionV0;

use crate::DelegationClaimBotV0;

#[derive(Accounts)]
pub struct CloseDelegationClaimBotV0<'info> {
  #[account(mut)]
  /// CHECK: Doesn't matter
  pub rent_refund: AccountInfo<'info>,
  #[account(
    mut,
    has_one = task_queue,
    has_one = delegated_position,
    has_one = rent_refund,
    has_one = next_task,
    seeds = [b"delegation_claim_bot", task_queue.key().as_ref(), delegated_position.key().as_ref()],
    bump = delegation_claim_bot.bump_seed,
    close = rent_refund
  )]
  pub delegation_claim_bot: Box<Account<'info, DelegationClaimBotV0>>,
  #[account(mut)]
  pub task_queue: Box<Account<'info, TaskQueueV0>>,
  #[account(
    has_one = position,
  )]
  pub delegated_position: Account<'info, DelegatedPositionV0>,
  #[account(
    has_one = mint,
  )]
  pub position: Box<Account<'info, PositionV0>>,
  pub position_authority: Signer<'info>,
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    token::mint = mint,
    token::authority = position_authority,
    constraint = position_token_account.amount > 0
  )]
  pub position_token_account: Box<Account<'info, TokenAccount>>,
  pub system_program: Program<'info, System>,
  /// CHECK: By has_one
  #[account(mut)]
  pub next_task: AccountInfo<'info>,
  #[account(
    seeds = [b"task_queue_authority", task_queue.key().as_ref(), queue_authority.key().as_ref()],
    bump = task_queue_authority.bump_seed,
    seeds::program = tuktuk_program.key(),
  )]
  pub task_queue_authority: Box<Account<'info, TaskQueueAuthorityV0>>,
  /// CHECK: By seeds
  #[account(
    seeds = [b"queue_authority"],
    bump,
  )]
  pub queue_authority: AccountInfo<'info>,
  pub tuktuk_program: Program<'info, Tuktuk>,
}

pub fn handler(ctx: Context<CloseDelegationClaimBotV0>) -> Result<()> {
  if !ctx.accounts.next_task.data_is_empty() {
    let next_task = ctx.accounts.next_task.to_account_info();
    let task = try_from!(Account<TaskV0>, next_task)?;
    let rent_refund_acc = if task.rent_refund == ctx.accounts.task_queue.key() {
      ctx.accounts.task_queue.to_account_info()
    } else {
      ctx.accounts.rent_refund.to_account_info()
    };
    dequeue_task_v0(CpiContext::new_with_signer(
      ctx.accounts.tuktuk_program.to_account_info(),
      DequeueTaskV0 {
        task_queue: ctx.accounts.task_queue.to_account_info(),
        task_queue_authority: ctx.accounts.task_queue_authority.to_account_info(),
        task: ctx.accounts.next_task.to_account_info(),
        queue_authority: ctx.accounts.queue_authority.to_account_info(),
        rent_refund: rent_refund_acc,
      },
      &[&["queue_authority".as_bytes(), &[ctx.bumps.queue_authority]]],
    ))?;
  }

  Ok(())
}
