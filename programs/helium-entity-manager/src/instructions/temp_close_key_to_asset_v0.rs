use anchor_lang::prelude::*;

use crate::KeyToAssetV0;
use helium_sub_daos::DaoV0;
use lazy_distributor::state::RecipientV0;

const AUTHORITY: Pubkey = pubkey!("hrp7GncEa2fJbweaGU5vkbZGwsoNQieahETrXcyrbTY");

#[derive(Accounts)]
pub struct TempCloseKeyToAssetV0<'info> {
  #[account(
    mut,
    close = authority,
    has_one = dao,
    has_one = asset,
  )]
  pub key_to_asset: Box<Account<'info, KeyToAssetV0>>,
  pub dao: Box<Account<'info, DaoV0>>,
  /// CHECK: Verified by has_one constraint on key_to_asset
  pub asset: UncheckedAccount<'info>,
  #[account(
    constraint = recipient.asset == asset.key(),
    // current_rewards is the oracle buffer. If it is not None (or 0), then there are pending rewards
    // that have not been distributed. We should only close if the buffer is empty.
    constraint = recipient.current_rewards.iter().all(|r| (*r).unwrap_or(0) == 0)
  )]
  pub recipient: Box<Account<'info, RecipientV0>>,
  #[account(
    address = AUTHORITY
  )]
  pub authority: Signer<'info>,
}

pub fn handler(_ctx: Context<TempCloseKeyToAssetV0>) -> Result<()> {
  // Account is closed automatically by Anchor due to close constraint
  Ok(())
}
