use crate::{state::*, util::set_executed};
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct CloseMarkerArgsV0 {
  pub index: u32,
}

#[derive(Accounts)]
#[instruction(args: CloseMarkerArgsV0)]
pub struct CloseMarkerV0<'info> {
  #[account(mut)]
  /// CHECK: Just receiving funds
  pub refund: UncheckedAccount<'info>,
  #[account(
    mut,
    has_one = authority,
    has_one = executed_transactions,
  )]
  pub lazy_transactions: Account<'info, LazyTransactionsV0>,
  pub authority: Signer<'info>,
  #[account(
    mut,
    close = refund,
    seeds = ["block".as_bytes(), lazy_transactions.key().as_ref(), &args.index.to_le_bytes()],
    bump
  )]
  pub block: Account<'info, Block>,
  /// CHECK: Checked by has_one
  #[account(mut)]
  pub executed_transactions: AccountInfo<'info>,
}

pub fn handler(ctx: Context<CloseMarkerV0>, args: CloseMarkerArgsV0) -> Result<()> {
  let slice = &mut ctx.accounts.executed_transactions.try_borrow_mut_data()?[1..];
  set_executed(slice, args.index);

  Ok(())
}
