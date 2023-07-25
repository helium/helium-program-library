use crate::{rewardable_entity_config_seeds, state::*, TESTING};
use anchor_lang::{prelude::*, solana_program::hash::hash};
use helium_sub_daos::{
  cpi::{accounts::TrackDcOnboardingFeesV0, track_dc_onboarding_fees_v0},
  program::HeliumSubDaos,
  DaoV0, SubDaoV0, TrackDcOnboardingFeesArgsV0,
};

#[derive(Accounts)]
pub struct TempBackfillMobileInfoDataV0<'info> {
  pub authority: Signer<'info>,
  #[account(
    has_one = sub_dao,
    constraint = rewardable_entity_config.settings.is_mobile() && (rewardable_entity_config.symbol == "MOBILE" || TESTING),
  )]
  pub rewardable_entity_config: Box<Account<'info, RewardableEntityConfigV0>>,
  #[account(
      mut,
      has_one = authority,
    )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    has_one = dao,
  )]
  pub key_to_asset: Box<Account<'info, KeyToAssetV0>>,
  #[account(mut,
    seeds = [
      "mobile_info".as_bytes(),
      rewardable_entity_config.key().as_ref(),
      &hash(&key_to_asset.entity_key[..]).to_bytes()
    ],
    bump
  )]
  pub mobile_info: Box<Account<'info, MobileHotspotInfoV0>>,
  pub helium_sub_daos_program: Program<'info, HeliumSubDaos>,
}

pub fn handler(ctx: Context<TempBackfillMobileInfoDataV0>) -> Result<()> {
  let dc_fee = ctx.accounts.sub_dao.onboarding_dc_fee;
  ctx.accounts.mobile_info.dc_onboarding_fee_paid = dc_fee;

  track_dc_onboarding_fees_v0(
    CpiContext::new_with_signer(
      ctx.accounts.helium_sub_daos_program.to_account_info(),
      TrackDcOnboardingFeesV0 {
        hem_auth: ctx.accounts.rewardable_entity_config.to_account_info(),
        sub_dao: ctx.accounts.sub_dao.to_account_info(),
      },
      &[rewardable_entity_config_seeds!(
        ctx.accounts.rewardable_entity_config
      )],
    ),
    TrackDcOnboardingFeesArgsV0 {
      amount: dc_fee,
      add: true,
      symbol: ctx.accounts.rewardable_entity_config.symbol.clone(),
    },
  )?;

  Ok(())
}
