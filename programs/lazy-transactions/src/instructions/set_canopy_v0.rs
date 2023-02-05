use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct SetCanopyArgsV0 {
  pub offset: u32,
  pub bytes: Vec<u8>,
}

#[derive(Accounts)]
#[instruction(args: SetCanopyArgsV0)]
pub struct SetCanopyV0<'info> {
  pub authority: Signer<'info>,
  #[account(
    mut,
    has_one = authority,
    has_one = canopy
  )]
  pub lazy_transactions: Account<'info, LazyTransactionsV0>,
  /// CHECK: Verified by has one
  #[account(mut)]
  pub canopy: UncheckedAccount<'info>,
}

/// NOTE: This is a dangerous operation, as index markers will be preserved.
pub fn handler(ctx: Context<SetCanopyV0>, args: SetCanopyArgsV0) -> Result<()> {
  let mut data = ctx.accounts.canopy.try_borrow_mut_data()?;
  data[(args.offset + 1) as usize..(args.offset + 1) as usize + args.bytes.len()]
    .copy_from_slice(&args.bytes);

  Ok(())
}
