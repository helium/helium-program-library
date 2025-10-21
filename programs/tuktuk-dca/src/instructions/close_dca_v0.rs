use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use tuktuk_program::{
  tuktuk::{
    self,
    cpi::{accounts::DequeueTaskV0, dequeue_task_v0},
    program::Tuktuk,
  },
  TaskQueueAuthorityV0, TaskV0,
};

use crate::{dca_seeds, queue_authority_seeds, state::*};

#[derive(Accounts)]
pub struct CloseDcaV0<'info> {
  #[account(mut)]
  pub authority: Signer<'info>,
  #[account(
    mut,
    close = rent_refund,
    has_one = authority,
    has_one = next_task,
    has_one = task_queue,
    has_one = rent_refund,
    has_one = input_mint,
    has_one = input_account,
  )]
  pub dca: Box<Account<'info, DcaV0>>,
  pub input_mint: Box<Account<'info, Mint>>,
  #[account(
    mut,
    associated_token::mint = input_mint,
    associated_token::authority = dca,
  )]
  pub input_account: Box<Account<'info, TokenAccount>>,
  #[account(
    mut,
    associated_token::mint = input_mint,
    associated_token::authority = authority,
  )]
  pub authority_input_account: Box<Account<'info, TokenAccount>>,
  /// CHECK: queue authority
  #[account(
    seeds = [b"queue_authority"],
    bump = dca.queue_authority_bump,
  )]
  pub queue_authority: UncheckedAccount<'info>,
  /// CHECK: task queue authority
  #[account(
    seeds = [b"task_queue_authority", task_queue.key().as_ref(), queue_authority.key().as_ref()],
    bump = task_queue_authority.bump_seed,
    seeds::program = tuktuk::ID,
  )]
  pub task_queue_authority: Box<Account<'info, TaskQueueAuthorityV0>>,
  /// CHECK: Rent refund destination
  #[account(mut)]
  pub rent_refund: SystemAccount<'info>,
  /// CHECK: task queue account
  #[account(mut)]
  pub task_queue: UncheckedAccount<'info>,
  /// CHECK: current task account
  #[account(mut)]
  pub next_task: Box<Account<'info, TaskV0>>,
  pub tuktuk_program: Program<'info, Tuktuk>,
  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CloseDcaV0>) -> Result<()> {
  let dca = &ctx.accounts.dca;

  // Transfer any remaining tokens back to authority
  let remaining_balance = ctx.accounts.input_account.amount;
  if remaining_balance > 0 {
    anchor_spl::token::transfer(
      CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        anchor_spl::token::Transfer {
          from: ctx.accounts.input_account.to_account_info(),
          to: ctx.accounts.authority_input_account.to_account_info(),
          authority: dca.to_account_info(),
        },
        &[dca_seeds!(dca)],
      ),
      remaining_balance,
    )?;
  }

  // Close the input token account
  anchor_spl::token::close_account(CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    anchor_spl::token::CloseAccount {
      account: ctx.accounts.input_account.to_account_info(),
      destination: ctx.accounts.rent_refund.to_account_info(),
      authority: dca.to_account_info(),
    },
    &[dca_seeds!(dca)],
  ))?;

  // Only dequeue the task if it's not pointing to itself (which means no task scheduled)
  if ctx.accounts.next_task.key() != ctx.accounts.dca.key() {
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
      &[queue_authority_seeds!(ctx.accounts.dca)],
    ))?
  }

  Ok(())
}
