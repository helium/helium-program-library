use crate::state::*;
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
}

/// NOTE: This is a dangerous operation, as index markers will be preserved.
pub fn handler(
  ctx: Context<UpdateLazyTransactionsV0>,
  args: UpdateLazyTransactionsArgsV0,
) -> Result<()> {
  if let Some(authority) = args.authority {
    ctx.accounts.lazy_transactions.authority = authority;
  }

  if let Some(root) = args.root {
    ctx.accounts.lazy_transactions.root = root;
  }

  Ok(())
}
