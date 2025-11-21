use anchor_lang::prelude::*;

use crate::{hash_entity_key, KeyToAssetV0, RewardableEntityConfigV0};
use helium_sub_daos::DaoV0;

const AUTHORITY: Pubkey = pubkey!("hrp7GncEa2fJbweaGU5vkbZGwsoNQieahETrXcyrbTY");

#[derive(Accounts)]
pub struct TempCloseKeyToAssetV0<'info> {
  #[account(
    address = AUTHORITY
  )]
  pub authority: Signer<'info>,
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
  /// CHECK: Validated by seeds. Verify that the asset is not an iot hotspot
  #[account(
    seeds = [
      "iot_info".as_bytes(),
      iot_config.key().as_ref(),
      &hash_entity_key(&key_to_asset.entity_key[..])
    ],
    bump,
    constraint = iot_info.data_is_empty()
  )]
  pub iot_info: UncheckedAccount<'info>,
  /// CHECK: Validated by seeds. Verify that the asset is not a mobile hotspot
  #[account(
    seeds = [
      "mobile_info".as_bytes(),
      mobile_config.key().as_ref(),
      &hash_entity_key(&key_to_asset.entity_key[..])
    ],
    bump,
    constraint = mobile_info.data_is_empty()
  )]
  pub mobile_info: UncheckedAccount<'info>,
  /// CHECK: Validated by seeds
  #[account(
    seeds = ["rewardable_entity_config".as_bytes(), iot_config.sub_dao.as_ref(), "IOT".as_bytes()],
    bump = iot_config.bump_seed,
  )]
  pub iot_config: Box<Account<'info, RewardableEntityConfigV0>>,
  /// CHECK: Validated by seeds
  #[account(
    seeds = ["rewardable_entity_config".as_bytes(), mobile_config.sub_dao.as_ref(), "MOBILE".as_bytes()],
    bump = mobile_config.bump_seed,
  )]
  pub mobile_config: Box<Account<'info, RewardableEntityConfigV0>>,
}

pub fn handler(_ctx: Context<TempCloseKeyToAssetV0>) -> Result<()> {
  // Account is closed automatically by Anchor due to close constraint
  Ok(())
}
