use crate::state::*;
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
    has_one = authority
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
}

pub fn handler(ctx: Context<CloseMarkerV0>, args: CloseMarkerArgsV0) -> Result<()> {
  ctx.accounts.lazy_transactions.executed[args.index as usize] = true;

  Ok(())
}
