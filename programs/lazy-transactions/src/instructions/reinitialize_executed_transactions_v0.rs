use crate::state::*;
use crate::util::get_bitmap_len;
use anchor_lang::prelude::*;
use shared_utils::resize_to_fit;

#[derive(Accounts)]
pub struct ReinitializeExecutedTransactionsV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub authority: Signer<'info>,
  #[account(
    mut,
    has_one = authority
  )]
  pub lazy_transactions: Box<Account<'info, LazyTransactionsV0>>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ReinitializeExecutedTransactionsV0>) -> Result<()> {
  ctx.accounts.lazy_transactions.executed =
    vec![0; get_bitmap_len(ctx.accounts.lazy_transactions.max_depth)];

  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts.lazy_transactions,
  )?;
  Ok(())
}
