use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Token, TokenAccount},
};
use helium_sub_daos::DaoV0;
use tuktuk_program::{
  tuktuk::{
    self,
    cpi::{accounts::DequeueTaskV0, dequeue_task_v0},
    program::Tuktuk,
  },
  TaskQueueAuthorityV0, TaskV0,
};

use crate::{auto_top_off_seeds, queue_authority_seeds, state::*};

#[derive(Accounts)]
pub struct CloseAutoTopOffV0<'info> {
  #[account(mut)]
  pub authority: Signer<'info>,
  #[account(
    mut,
    close = rent_refund,
    has_one = authority,
    has_one = next_task,
    has_one = next_pyth_task,
    has_one = task_queue,
    has_one = dao,
  )]
  pub auto_top_off: Box<Account<'info, AutoTopOffV0>>,
  /// CHECK: queue authority
  #[account(
    seeds = [b"queue_authority"],
    bump = auto_top_off.queue_authority_bump,
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
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    mut,
    associated_token::mint = dao.hnt_mint,
    associated_token::authority = auto_top_off,
  )]
  pub hnt_account: Box<Account<'info, TokenAccount>>,
  #[account(
    mut,
    associated_token::mint = auto_top_off.dc_mint,
    associated_token::authority = auto_top_off,
  )]
  pub dc_account: Box<Account<'info, TokenAccount>>,
  /// CHECK: current pre-task account
  #[account(mut)]
  pub next_pyth_task: Box<Account<'info, TaskV0>>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub token_program: Program<'info, Token>,
  pub tuktuk_program: Program<'info, Tuktuk>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CloseAutoTopOffV0>) -> Result<()> {
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
    &[queue_authority_seeds!(ctx.accounts.auto_top_off)],
  ))?;
  dequeue_task_v0(CpiContext::new_with_signer(
    ctx.accounts.tuktuk_program.to_account_info(),
    DequeueTaskV0 {
      task_queue: ctx.accounts.task_queue.to_account_info(),
      task: ctx.accounts.next_pyth_task.to_account_info(),
      queue_authority: ctx.accounts.queue_authority.to_account_info(),
      rent_refund: if ctx.accounts.next_pyth_task.rent_refund == ctx.accounts.rent_refund.key() {
        ctx.accounts.rent_refund.to_account_info()
      } else {
        ctx.accounts.task_queue.to_account_info()
      },
      task_queue_authority: ctx.accounts.task_queue_authority.to_account_info(),
    },
    &[queue_authority_seeds!(ctx.accounts.auto_top_off)],
  ))?;

  // Transfer any remaining tokens back to authority
  let remaining_hnt_balance = ctx.accounts.hnt_account.amount;
  if remaining_hnt_balance > 0 {
    anchor_spl::token::transfer(
      CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        anchor_spl::token::Transfer {
          from: ctx.accounts.hnt_account.to_account_info(),
          to: ctx.accounts.authority.to_account_info(),
          authority: ctx.accounts.auto_top_off.to_account_info(),
        },
        &[auto_top_off_seeds!(ctx.accounts.auto_top_off)],
      ),
      remaining_hnt_balance,
    )?;
  }

  // Close the escrow account
  anchor_spl::token::close_account(CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    anchor_spl::token::CloseAccount {
      account: ctx.accounts.hnt_account.to_account_info(),
      destination: ctx.accounts.rent_refund.to_account_info(),
      authority: ctx.accounts.auto_top_off.to_account_info(),
    },
    &[auto_top_off_seeds!(ctx.accounts.auto_top_off)],
  ))?;
  // Close the DC account
  anchor_spl::token::close_account(CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    anchor_spl::token::CloseAccount {
      account: ctx.accounts.dc_account.to_account_info(),
      destination: ctx.accounts.rent_refund.to_account_info(),
      authority: ctx.accounts.auto_top_off.to_account_info(),
    },
    &[auto_top_off_seeds!(ctx.accounts.auto_top_off)],
  ))?;

  Ok(())
}
