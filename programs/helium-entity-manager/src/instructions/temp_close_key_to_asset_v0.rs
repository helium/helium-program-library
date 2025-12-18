use anchor_lang::{prelude::*, solana_program::system_program};

use crate::{
  hash_entity_key, IotHotspotInfoV0, KeyToAssetV0, MobileHotspotInfoV0, RewardableEntityConfigV0,
};
use helium_sub_daos::{DaoV0, SubDaoV0};

// Special entity keys that should be rejected
const NOT_EMITTED: &str = "not_emitted";
const IOT_OPERATIONS_FUND: &str = "iot_operations_fund";

const AUTHORITY: Pubkey = pubkey!("hrp7GncEa2fJbweaGU5vkbZGwsoNQieahETrXcyrbTY");

// Hardcoded key_to_asset addresses from initial migration that can bypass info checks
const ALLOWED_KEY_TO_ASSETS: [Pubkey; 4] = [
  pubkey!("AcKpRTmy6YKpQaWfLDBUaduQU1kHhNVLrPkW3TmEEqsc"),
  pubkey!("3stUgrUq4j5BbamGdy7X2Y3dee24EeY5u1F7RHrrmaoP"),
  pubkey!("4v7nfEN2Wj342Zm6V1Jwk9i5YCUHu6zBAJFENk6Gxzvr"),
  pubkey!("2RtR6aVt6QgCSdV8LEH6ogWtDXGJpL73aB72DevJKgFC"),
];

fn close<'info>(info: AccountInfo<'info>, sol_destination: AccountInfo<'info>) -> Result<()> {
  let dest_starting_lamports = sol_destination.lamports();
  **sol_destination.lamports.borrow_mut() =
    dest_starting_lamports.checked_add(info.lamports()).unwrap();
  **info.lamports.borrow_mut() = 0;

  info.assign(&system_program::ID);
  info.realloc(0, false).map_err(Into::into)
}

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
  /// CHECK: Validated by seeds. Must be empty unless key_to_asset is in allowed list
  #[account(
    mut,
    seeds = [
      "iot_info".as_bytes(),
      iot_config.key().as_ref(),
      &hash_entity_key(&key_to_asset.entity_key[..])
    ],
    bump,
    // Either key_to_asset is in allowed list OR iot_info must be empty
    constraint = ALLOWED_KEY_TO_ASSETS.contains(&key_to_asset.key()) || iot_info.data_is_empty()
  )]
  pub iot_info: UncheckedAccount<'info>,
  /// CHECK: Validated by seeds. Must be empty unless key_to_asset is in allowed list
  #[account(
    mut,
    seeds = [
      "mobile_info".as_bytes(),
      mobile_config.key().as_ref(),
      &hash_entity_key(&key_to_asset.entity_key[..])
    ],
    bump,
    // Either key_to_asset is in allowed list OR mobile_info must be empty
    constraint = ALLOWED_KEY_TO_ASSETS.contains(&key_to_asset.key()) || mobile_info.data_is_empty()
  )]
  pub mobile_info: UncheckedAccount<'info>,
  /// Validate that iot_sub_dao belongs to the same dao as key_to_asset
  #[account(
    has_one = dao,
  )]
  pub iot_sub_dao: Box<Account<'info, SubDaoV0>>,
  /// Validate that mobile_sub_dao belongs to the same dao as key_to_asset
  #[account(
    has_one = dao,
  )]
  pub mobile_sub_dao: Box<Account<'info, SubDaoV0>>,
  /// CHECK: Validated by seeds. Ensure it's derived from iot_sub_dao
  #[account(
    seeds = ["rewardable_entity_config".as_bytes(), iot_sub_dao.key().as_ref(), "IOT".as_bytes()],
    bump = iot_config.bump_seed,
  )]
  pub iot_config: Box<Account<'info, RewardableEntityConfigV0>>,
  /// CHECK: Validated by seeds. Ensure it's derived from mobile_sub_dao
  #[account(
    seeds = ["rewardable_entity_config".as_bytes(), mobile_sub_dao.key().as_ref(), "MOBILE".as_bytes()],
    bump = mobile_config.bump_seed,
  )]
  pub mobile_config: Box<Account<'info, RewardableEntityConfigV0>>,
}

pub fn handler(ctx: Context<TempCloseKeyToAssetV0>) -> Result<()> {
  // Reject key_to_asset accounts created for special entities
  let entity_key_str = String::from_utf8_lossy(&ctx.accounts.key_to_asset.entity_key);
  require!(
    entity_key_str != NOT_EMITTED && entity_key_str != IOT_OPERATIONS_FUND,
    ErrorCode::ConstraintRaw
  );

  // Only close info accounts if key_to_asset is in the allowed list
  if ALLOWED_KEY_TO_ASSETS.contains(&ctx.accounts.key_to_asset.key()) {
    // Close iot_info if it exists (has data)
    if !ctx.accounts.iot_info.data_is_empty() {
      let iot_data = ctx.accounts.iot_info.try_borrow_data()?;
      if iot_data.len() >= 8 {
        let discriminator: [u8; 8] = iot_data[..8].try_into().unwrap();
        if discriminator == IotHotspotInfoV0::DISCRIMINATOR {
          drop(iot_data);
          close(
            ctx.accounts.iot_info.to_account_info(),
            ctx.accounts.authority.to_account_info(),
          )?;
        }
      }
    }

    // Close mobile_info if it exists (has data)
    if !ctx.accounts.mobile_info.data_is_empty() {
      let mobile_data = ctx.accounts.mobile_info.try_borrow_data()?;
      if mobile_data.len() >= 8 {
        let discriminator: [u8; 8] = mobile_data[..8].try_into().unwrap();
        if discriminator == MobileHotspotInfoV0::DISCRIMINATOR {
          drop(mobile_data);
          close(
            ctx.accounts.mobile_info.to_account_info(),
            ctx.accounts.authority.to_account_info(),
          )?;
        }
      }
    }
  }

  // key_to_asset is closed automatically by Anchor due to close constraint
  Ok(())
}
