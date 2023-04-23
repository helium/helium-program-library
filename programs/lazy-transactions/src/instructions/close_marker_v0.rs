use crate::state::*;
use anchor_lang::prelude::*;


#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct CloseMarkerArgsV0 {
  pub index: u64,
}

#[derive(Accounts)]
#[instruction(args: CloseMarkerArgsV0)]
pub struct CloseMarkerV0<'info> {
  #[account(mut)]
  /// CHECK: Just receiving funds
  pub refund: UncheckedAccount<'info>,
  #[account(
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

pub fn handler(_ctx: Context<CloseMarkerV0>, _args: CloseMarkerArgsV0) -> Result<()> {
  Ok(())
}
