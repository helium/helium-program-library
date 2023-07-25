use crate::{state::*, TESTING};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use helium_sub_daos::{DaoV0, SubDaoV0};

#[derive(Accounts)]
pub struct TempBackfillOnboardingFeesV0<'info> {
  pub active_device_authority: Signer<'info>,
  #[account(
    has_one = sub_dao,
    constraint = rewardable_entity_config.settings.is_iot() && (rewardable_entity_config.symbol == "IOT" || TESTING),
  )]
  pub rewardable_entity_config: Box<Account<'info, RewardableEntityConfigV0>>,
  #[account(
    mut,
    has_one = active_device_authority,
    has_one = dao,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    has_one = dao,
  )]
  pub key_to_asset: Box<Account<'info, KeyToAssetV0>>,
  #[account(mut,
    seeds = [
      "iot_info".as_bytes(),
      rewardable_entity_config.key().as_ref(),
      &hash(&key_to_asset.entity_key[..]).to_bytes()
    ],
    bump
  )]
  pub iot_info: Box<Account<'info, IotHotspotInfoV0>>,
}

pub fn handler(ctx: Context<TempBackfillOnboardingFeesV0>) -> Result<()> {
  let onboarding_fee = if ctx.accounts.iot_info.is_full_hotspot {
    4000000
  } else {
    1000000
  };
  ctx.accounts.iot_info.dc_onboarding_fee_paid = onboarding_fee;
  Ok(())
}
