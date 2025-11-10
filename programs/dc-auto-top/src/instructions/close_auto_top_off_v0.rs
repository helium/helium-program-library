use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use helium_sub_daos::{try_from, DaoV0};
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
    has_one = next_hnt_task,
    has_one = task_queue,
    has_one = dao,
    has_one = dc_account,
    has_one = dca_mint_account,
  )]
  pub auto_top_off: AccountLoader<'info, AutoTopOffV0>,
  /// CHECK: queue authority
  #[account(
    seeds = [b"queue_authority"],
    bump = auto_top_off.load()?.queue_authority_bump,
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
  #[account(has_one = hnt_mint)]
  pub dao: Box<Account<'info, DaoV0>>,
  pub hnt_mint: Box<Account<'info, Mint>>,
  #[account(
    mut,
    associated_token::mint = hnt_mint,
    associated_token::authority = auto_top_off,
  )]
  pub hnt_account: Box<Account<'info, TokenAccount>>,
  #[account(
    init_if_needed,
    payer = authority,
    associated_token::mint = hnt_mint,
    associated_token::authority = authority,
  )]
  pub authority_hnt_account: Box<Account<'info, TokenAccount>>,
  #[account(mut)]
  pub dc_account: Box<Account<'info, TokenAccount>>,
  #[account(mut)]
  pub dca_mint_account: Box<Account<'info, TokenAccount>>,
  /// CHECK: current HNT task account
  #[account(mut)]
  pub next_hnt_task: UncheckedAccount<'info>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub token_program: Program<'info, Token>,
  pub tuktuk_program: Program<'info, Tuktuk>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CloseAutoTopOffV0>) -> Result<()> {
  let auto_top_off = ctx.accounts.auto_top_off.load()?;
  let queue_authority_bump = auto_top_off.queue_authority_bump;
  let remaining_hnt_balance = ctx.accounts.hnt_account.amount;
  let delegated_data_credits = auto_top_off.delegated_data_credits;
  let authority = auto_top_off.authority;
  let bump = auto_top_off.bump;
  let auto_top_off_seeds: &[&[&[u8]]] =
    &[auto_top_off_seeds!(delegated_data_credits, authority, bump)];
  drop(auto_top_off);
  let queue_authority_seeds: &[&[&[u8]]] = &[queue_authority_seeds!(queue_authority_bump)];
  if !ctx.accounts.next_task.data_is_empty()
    || ctx.accounts.next_task.key() != ctx.accounts.auto_top_off.key()
  {
    let next_task = try_from!(Account<TaskV0>, ctx.accounts.next_task)?;
    // Dequeue DC topoff task
    dequeue_task_v0(CpiContext::new_with_signer(
      ctx.accounts.tuktuk_program.to_account_info(),
      DequeueTaskV0 {
        task_queue: ctx.accounts.task_queue.to_account_info(),
        task: ctx.accounts.next_task.to_account_info(),
        queue_authority: ctx.accounts.queue_authority.to_account_info(),
        rent_refund: if next_task.rent_refund == ctx.accounts.rent_refund.key() {
          ctx.accounts.rent_refund.to_account_info()
        } else {
          ctx.accounts.task_queue.to_account_info()
        },
        task_queue_authority: ctx.accounts.task_queue_authority.to_account_info(),
      },
      queue_authority_seeds,
    ))?;
  }
  // Dequeue HNT topoff task
  if !ctx.accounts.next_hnt_task.data_is_empty()
    && ctx.accounts.next_hnt_task.key() != ctx.accounts.auto_top_off.key()
  {
    let next_hnt_task = try_from!(Account<TaskV0>, ctx.accounts.next_hnt_task)?;
    dequeue_task_v0(CpiContext::new_with_signer(
      ctx.accounts.tuktuk_program.to_account_info(),
      DequeueTaskV0 {
        task_queue: ctx.accounts.task_queue.to_account_info(),
        task: ctx.accounts.next_hnt_task.to_account_info(),
        queue_authority: ctx.accounts.queue_authority.to_account_info(),
        rent_refund: if next_hnt_task.rent_refund == ctx.accounts.rent_refund.key() {
          ctx.accounts.rent_refund.to_account_info()
        } else {
          ctx.accounts.task_queue.to_account_info()
        },
        task_queue_authority: ctx.accounts.task_queue_authority.to_account_info(),
      },
      queue_authority_seeds,
    ))?;
  }

  // Transfer any remaining HNT tokens back to authority
  if remaining_hnt_balance > 0 {
    anchor_spl::token::transfer(
      CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        anchor_spl::token::Transfer {
          from: ctx.accounts.hnt_account.to_account_info(),
          to: ctx.accounts.authority_hnt_account.to_account_info(),
          authority: ctx.accounts.auto_top_off.to_account_info(),
        },
        auto_top_off_seeds,
      ),
      remaining_hnt_balance,
    )?;
  }

  // Transfer any remaining DCA mint tokens back to authority
  let remaining_dca_balance = ctx.accounts.dca_mint_account.amount;
  if remaining_dca_balance > 0 {
    anchor_spl::token::transfer(
      CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        anchor_spl::token::Transfer {
          from: ctx.accounts.dca_mint_account.to_account_info(),
          to: ctx.accounts.authority.to_account_info(),
          authority: ctx.accounts.auto_top_off.to_account_info(),
        },
        auto_top_off_seeds,
      ),
      remaining_dca_balance,
    )?;
  }

  // Close the HNT account
  anchor_spl::token::close_account(CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    anchor_spl::token::CloseAccount {
      account: ctx.accounts.hnt_account.to_account_info(),
      destination: ctx.accounts.rent_refund.to_account_info(),
      authority: ctx.accounts.auto_top_off.to_account_info(),
    },
    auto_top_off_seeds,
  ))?;
  // Close the DC account
  anchor_spl::token::close_account(CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    anchor_spl::token::CloseAccount {
      account: ctx.accounts.dc_account.to_account_info(),
      destination: ctx.accounts.rent_refund.to_account_info(),
      authority: ctx.accounts.auto_top_off.to_account_info(),
    },
    auto_top_off_seeds,
  ))?;
  // Close the DCA mint account
  anchor_spl::token::close_account(CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    anchor_spl::token::CloseAccount {
      account: ctx.accounts.dca_mint_account.to_account_info(),
      destination: ctx.accounts.rent_refund.to_account_info(),
      authority: ctx.accounts.auto_top_off.to_account_info(),
    },
    auto_top_off_seeds,
  ))?;

  Ok(())
}
