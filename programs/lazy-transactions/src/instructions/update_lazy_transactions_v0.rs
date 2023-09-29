use crate::{canopy::check_canopy_bytes, id, state::*, util::get_bitmap_len};
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateLazyTransactionsArgsV0 {
  pub root: Option<[u8; 32]>,
  pub authority: Option<Pubkey>,
}

#[derive(Accounts)]
#[instruction(args: UpdateLazyTransactionsArgsV0)]
pub struct UpdateLazyTransactionsV0<'info> {
  pub authority: Signer<'info>,
  #[account(
    mut,
    has_one = authority
  )]
  pub lazy_transactions: Account<'info, LazyTransactionsV0>,
  /// CHECK: Account to store the canopy, the size will determine the size of the canopy
  #[account(
    mut,
    owner = id(),
    constraint = canopy.key() == lazy_transactions.canopy || canopy.data.borrow()[0] == 0,
    constraint = check_canopy_bytes(&canopy.data.borrow()[1..]).is_ok(),
  )]
  pub canopy: AccountInfo<'info>,
  /// CHECK: Account to store the bitmap of executed txns, the size will determine the size of the bitmap
  #[account(
    mut,
    owner = id(),
    constraint = executed_transactions.key() == lazy_transactions.executed_transactions || executed_transactions.data.borrow()[0] == 0,
    constraint = executed_transactions.data.borrow().len() == 1 + get_bitmap_len(lazy_transactions.max_depth),
  )]
  pub executed_transactions: AccountInfo<'info>,
}

/// NOTE: This is a dangerous operation, as index markers will be preserved.
pub fn handler(
  ctx: Context<UpdateLazyTransactionsV0>,
  args: UpdateLazyTransactionsArgsV0,
) -> Result<()> {
  let mut data = ctx.accounts.canopy.try_borrow_mut_data()?;
  data[0] = 1;
  let mut exdata = ctx.accounts.executed_transactions.try_borrow_mut_data()?;
  exdata[0] = 1;

  ctx.accounts.lazy_transactions.canopy = ctx.accounts.canopy.key();
  ctx.accounts.lazy_transactions.executed_transactions = ctx.accounts.executed_transactions.key();

  if let Some(authority) = args.authority {
    ctx.accounts.lazy_transactions.authority = authority;
  }

  if let Some(root) = args.root {
    ctx.accounts.lazy_transactions.root = root;
  }

  Ok(())
}
