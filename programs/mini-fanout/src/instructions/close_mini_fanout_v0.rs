use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{close_account, transfer, CloseAccount, Mint, Token, TokenAccount, Transfer},
};
use tuktuk_program::{
  tuktuk::{
    self,
    cpi::{accounts::DequeueTaskV0, dequeue_task_v0},
    program::Tuktuk,
  },
  TaskQueueAuthorityV0,
};

use crate::{
  fanout_seeds, queue_authority_seeds, rent_refund_account, state::*, task_names, task_runs,
};

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
    has_one = task_queue,
    has_one = token_account,
    has_one = mint
  )]
  pub mini_fanout: Box<Account<'info, MiniFanoutV0>>,
  pub mint: Box<Account<'info, Mint>>,
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
  pub next_task: UncheckedAccount<'info>,
  #[account(mut)]
  pub token_account: Account<'info, TokenAccount>,
  #[account(
    init_if_needed,
    payer = owner,
    associated_token::mint = mint,
    associated_token::authority = owner
  )]
  pub owner_token_account: Account<'info, TokenAccount>,
  /// CHECK: current pre-task account
  #[account(mut)]
  pub next_pre_task: UncheckedAccount<'info>,
  /// CHECK: task rent refund account
  #[account(mut)]
  pub task_rent_refund: UncheckedAccount<'info>,
  pub tuktuk_program: Program<'info, Tuktuk>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler<'info>(ctx: Context<'_, '_, '_, 'info, CloseMiniFanoutV0<'info>>) -> Result<()> {
  transfer(
    CpiContext::new_with_signer(
      ctx.accounts.token_program.to_account_info(),
      Transfer {
        from: ctx.accounts.token_account.to_account_info(),
        to: ctx.accounts.owner_token_account.to_account_info(),
        authority: ctx.accounts.mini_fanout.to_account_info(),
      },
      &[fanout_seeds!(ctx.accounts.mini_fanout)],
    ),
    ctx.accounts.token_account.amount,
  )?;
  close_account(CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    CloseAccount {
      account: ctx.accounts.token_account.to_account_info(),
      authority: ctx.accounts.mini_fanout.to_account_info(),
      destination: ctx.accounts.rent_refund.to_account_info(),
    },
    &[fanout_seeds!(ctx.accounts.mini_fanout)],
  ))?;
  let rent_refund_candidates = [
    ctx.accounts.task_rent_refund.to_account_info(),
    ctx.accounts.owner.to_account_info(),
    ctx.accounts.rent_refund.to_account_info(),
    ctx.accounts.task_queue.to_account_info(),
  ];
  if ctx.accounts.next_task.key() != ctx.accounts.mini_fanout.key()
    && !ctx.accounts.next_task.data_is_empty()
    && task_names(&ctx.accounts.next_task, &ctx.accounts.mini_fanout.key())?
  {
    let rent_refund = rent_refund_account(
      &ctx.accounts.next_task,
      &rent_refund_candidates,
      ctx.remaining_accounts,
    )?;
    dequeue_task_v0(CpiContext::new_with_signer(
      ctx.accounts.tuktuk_program.to_account_info(),
      DequeueTaskV0 {
        task_queue: ctx.accounts.task_queue.to_account_info(),
        task: ctx.accounts.next_task.to_account_info(),
        queue_authority: ctx.accounts.queue_authority.to_account_info(),
        rent_refund,
        task_queue_authority: ctx.accounts.task_queue_authority.to_account_info(),
      },
      &[queue_authority_seeds!(ctx.accounts.mini_fanout)],
    ))?;
  }
  // Only a fanout that stores a pre task dequeues one, and only a task whose transaction equals
  // that pre task.
  if ctx.accounts.mini_fanout.pre_task.is_some()
    && ctx.accounts.next_pre_task.key() != ctx.accounts.mini_fanout.key()
    && !ctx.accounts.next_pre_task.data_is_empty()
    && task_runs(
      &ctx.accounts.next_pre_task,
      &ctx.accounts.mini_fanout.pre_task,
    )?
  {
    let rent_refund = rent_refund_account(
      &ctx.accounts.next_pre_task,
      &rent_refund_candidates,
      ctx.remaining_accounts,
    )?;
    dequeue_task_v0(CpiContext::new_with_signer(
      ctx.accounts.tuktuk_program.to_account_info(),
      DequeueTaskV0 {
        task_queue: ctx.accounts.task_queue.to_account_info(),
        task: ctx.accounts.next_pre_task.to_account_info(),
        queue_authority: ctx.accounts.queue_authority.to_account_info(),
        rent_refund,
        task_queue_authority: ctx.accounts.task_queue_authority.to_account_info(),
      },
      &[queue_authority_seeds!(ctx.accounts.mini_fanout)],
    ))?;
  }
  Ok(())
}
