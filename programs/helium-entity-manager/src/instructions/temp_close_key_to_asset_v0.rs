use anchor_lang::prelude::*;

use crate::KeyToAssetV0;
use helium_sub_daos::DaoV0;

const AUTHORITY: Pubkey = pubkey!("hrp7GncEa2fJbweaGU5vkbZGwsoNQieahETrXcyrbTY");

#[derive(Accounts)]
pub struct TempCloseKeyToAssetV0<'info> {
  #[account(
    mut,
    close = authority,
    has_one = dao
  )]
  pub key_to_asset: Box<Account<'info, KeyToAssetV0>>,
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    address = AUTHORITY
  )]
  pub authority: Signer<'info>,
}

pub fn handler(_ctx: Context<TempCloseKeyToAssetV0>) -> Result<()> {
  // Account is closed automatically by Anchor due to close constraint
  Ok(())
}
