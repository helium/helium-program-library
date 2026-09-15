use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use tuktuk_dca::{
  cpi::{accounts::CloseDcaV0 as CloseDcaAccounts, close_dca_v0},
  program::TuktukDca,
  state::DcaV0,
};
use tuktuk_program::{tuktuk::program::Tuktuk, TaskQueueAuthorityV0};

use crate::{auto_top_off_seeds, errors::ErrorCode, state::*};

/// Closes a DCA the HNT refill leg created. The DCA's authority is the top-off PDA, so this is
/// the only route by which one can be closed and its unspent input returned.
#[derive(Accounts)]
pub struct CloseDcaV0<'info> {
  #[account(mut)]
  pub authority: Signer<'info>,
  // The CPI's `authority` is this account, and tuktuk-dca takes that account as writable.
  #[account(
    mut,
    has_one = authority,
    has_one = task_queue,
    has_one = dca_mint,
    has_one = dca_mint_account,
  )]
  pub auto_top_off: AccountLoader<'info, AutoTopOffV0>,
  #[account(
    mut,
    constraint = dca.load()?.authority == auto_top_off.key() @ ErrorCode::InvalidDcaAuthority,
  )]
  pub dca: AccountLoader<'info, DcaV0>,
  pub dca_mint: Box<Account<'info, Mint>>,
  /// The DCA's own input account, drained into `dca_mint_account` by the CPI below.
  #[account(mut)]
  pub dca_input_account: Box<Account<'info, TokenAccount>>,
  /// The top-off's own input token account: the DCA is its authority's associated account for
  /// the input mint, which is the only destination tuktuk-dca's close accepts.
  #[account(mut)]
  pub dca_mint_account: Box<Account<'info, TokenAccount>>,
  /// CHECK: tuktuk-dca's queue authority, checked by the program being called.
  #[account(mut)]
  pub queue_authority: UncheckedAccount<'info>,
  /// CHECK: checked by the program being called against `task_queue` and `queue_authority`.
  pub task_queue_authority: Box<Account<'info, TaskQueueAuthorityV0>>,
  /// CHECK: the DCA's recorded rent refund, checked by `has_one` on the program being called.
  #[account(mut)]
  pub rent_refund: SystemAccount<'info>,
  /// CHECK: task queue account
  #[account(mut)]
  pub task_queue: UncheckedAccount<'info>,
  /// CHECK: the DCA's recorded task, which may or may not still exist.
  #[account(mut)]
  pub next_task: UncheckedAccount<'info>,
  pub tuktuk_dca_program: Program<'info, TuktukDca>,
  pub tuktuk_program: Program<'info, Tuktuk>,
  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
  pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(ctx: Context<CloseDcaV0>) -> Result<()> {
  let auto_top_off = ctx.accounts.auto_top_off.load()?;
  let delegated_data_credits = auto_top_off.delegated_data_credits;
  let authority = auto_top_off.authority;
  let bump = auto_top_off.bump;
  drop(auto_top_off);

  close_dca_v0(CpiContext::new_with_signer(
    ctx.accounts.tuktuk_dca_program.to_account_info(),
    CloseDcaAccounts {
      authority: ctx.accounts.auto_top_off.to_account_info(),
      dca: ctx.accounts.dca.to_account_info(),
      input_mint: ctx.accounts.dca_mint.to_account_info(),
      input_account: ctx.accounts.dca_input_account.to_account_info(),
      authority_input_account: ctx.accounts.dca_mint_account.to_account_info(),
      queue_authority: ctx.accounts.queue_authority.to_account_info(),
      task_queue_authority: ctx.accounts.task_queue_authority.to_account_info(),
      rent_refund: ctx.accounts.rent_refund.to_account_info(),
      task_queue: ctx.accounts.task_queue.to_account_info(),
      next_task: ctx.accounts.next_task.to_account_info(),
      tuktuk_program: ctx.accounts.tuktuk_program.to_account_info(),
      token_program: ctx.accounts.token_program.to_account_info(),
      system_program: ctx.accounts.system_program.to_account_info(),
      associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
    },
    &[auto_top_off_seeds!(delegated_data_credits, authority, bump)],
  ))?;

  Ok(())
}
