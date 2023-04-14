use crate::state::*;
use anchor_lang::{prelude::*, solana_program::system_program};

pub fn close<'info>(info: AccountInfo<'info>, sol_destination: AccountInfo<'info>) -> Result<()> {
    // Transfer tokens from the account to the sol_destination.
    let dest_starting_lamports = sol_destination.lamports();
    **sol_destination.lamports.borrow_mut() =
        dest_starting_lamports.checked_add(info.lamports()).unwrap();
    **info.lamports.borrow_mut() = 0;

    info.assign(&system_program::ID);
    info.realloc(0, false).map_err(Into::into)
}

#[derive(Accounts)]
pub struct CloseCanopyV0<'info> {
  #[account(mut)]
  /// CHECK: Just receiving funds
  pub refund: UncheckedAccount<'info>,
  pub authority: Signer<'info>,
  #[account(
    mut,
    has_one = authority,
    has_one = canopy
  )]
  pub lazy_transactions: Account<'info, LazyTransactionsV0>,
  /// CHECK: Verified by has one
  #[account(
    mut,
  )]
  pub canopy: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<CloseCanopyV0>) -> Result<()> {
  close(ctx.accounts.canopy.to_account_info(), ctx.accounts.refund.to_account_info())?;
  Ok(())
}
