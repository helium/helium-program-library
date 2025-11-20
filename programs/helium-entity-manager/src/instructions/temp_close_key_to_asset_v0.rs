use anchor_lang::prelude::*;

use crate::{DaoV0, KeyToAssetV0};

const AUTHORITY: Pubkey = pubkey!("hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW");

#[derive(Accounts)]
pub struct TempCloseKeyToAssetV0<'info> {
  #[account(
    mut,
    close = rent_receiver,
    has_one = dao
  )]
  pub key_to_asset: Box<Account<'info, KeyToAssetV0>>,
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    address = AUTHORITY
  )]
  pub authority: Signer<'info>,
  /// CHECK: Receives the rent refund
  #[account(mut)]
  pub rent_receiver: UncheckedAccount<'info>,
}

pub fn handler(_ctx: Context<TempCloseKeyToAssetV0>) -> Result<()> {
  // Account is closed automatically by Anchor due to close constraint
  Ok(())
}
