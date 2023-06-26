use crate::state::*;
use anchor_lang::prelude::*;
use helium_sub_daos::SubDaoV0;

#[derive(Accounts)]
pub struct TempBackfillOnboardingFeesV0<'info> {
  pub active_device_authority: Signer<'info>,
  #[account(
    has_one = sub_dao,
    constraint = rewardable_entity_config.settings.is_iot() && rewardable_entity_config.symbol == "IOT",
  )]
  pub rewardable_entity_config: Box<Account<'info, RewardableEntityConfigV0>>,
  #[account(
    mut,
    has_one = active_device_authority,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(mut)]
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
