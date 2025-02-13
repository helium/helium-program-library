use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use data_credits::{
  cpi::{
    accounts::{BurnCommonV0, BurnWithoutTrackingV0},
    burn_without_tracking_v0,
  },
  program::DataCredits,
  BurnWithoutTrackingArgsV0, DataCreditsV0,
};
use helium_sub_daos::{
  cpi::{accounts::TrackDcOnboardingFeesV0, track_dc_onboarding_fees_v0},
  program::HeliumSubDaos,
  DaoV0, SubDaoV0, TrackDcOnboardingFeesArgsV0,
};

use super::hash_entity_key;
use crate::{error::ErrorCode, rewardable_entity_config_seeds, state::*, TESTING};

#[derive(Accounts)]
pub struct TempPayMobileOnboardingFeeV0<'info> {
  #[account(mut)]
  pub dc_fee_payer: Signer<'info>,
  #[account(
    mut,
    associated_token::mint = dc_mint,
    associated_token::authority = dc_fee_payer,
  )]
  pub dc_burner: Box<Account<'info, TokenAccount>>,
  #[account(
    has_one = sub_dao,
    constraint = rewardable_entity_config.settings.is_mobile() && (rewardable_entity_config.symbol == "MOBILE" || TESTING),
  )]
  pub rewardable_entity_config: Box<Account<'info, RewardableEntityConfigV0>>,
  #[account(
    mut,
    has_one = dao
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(
    has_one = dc_mint,
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(mut)]
  pub dc_mint: Box<Account<'info, Mint>>,
  #[account(
    seeds = [
      "dc".as_bytes(),
      dc_mint.key().as_ref()
    ],
    seeds::program = data_credits_program.key(),
    bump = dc.data_credits_bump,
    has_one = dc_mint
  )]
  pub dc: Account<'info, DataCreditsV0>,
  #[account(
    has_one = dao,
  )]
  pub key_to_asset: Box<Account<'info, KeyToAssetV0>>,
  #[account(mut,
    seeds = [
      "mobile_info".as_bytes(),
      rewardable_entity_config.key().as_ref(),
      &hash_entity_key(&key_to_asset.entity_key[..])
    ],
    bump,
    constraint = mobile_info.device_type == MobileDeviceTypeV0::Cbrs
  )]
  pub mobile_info: Box<Account<'info, MobileHotspotInfoV0>>,

  pub data_credits_program: Program<'info, DataCredits>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
  pub helium_sub_daos_program: Program<'info, HeliumSubDaos>,
}

pub fn handler(ctx: Context<TempPayMobileOnboardingFeeV0>) -> Result<()> {
  let dc_fee = ctx
    .accounts
    .rewardable_entity_config
    .settings
    .mobile_device_fees(ctx.accounts.mobile_info.device_type)
    .ok_or(error!(ErrorCode::InvalidDeviceType))?
    .dc_onboarding_fee;
  require_eq!(dc_fee, 4000000, ErrorCode::InvalidDcFee);
  require_eq!(
    ctx.accounts.mobile_info.dc_onboarding_fee_paid,
    0,
    ErrorCode::OnboardingFeeAlreadySet
  );
  ctx.accounts.mobile_info.dc_onboarding_fee_paid = dc_fee;

  burn_without_tracking_v0(
    CpiContext::new(
      ctx.accounts.data_credits_program.to_account_info(),
      BurnWithoutTrackingV0 {
        burn_accounts: BurnCommonV0 {
          data_credits: ctx.accounts.dc.to_account_info(),
          burner: ctx.accounts.dc_burner.to_account_info(),
          owner: ctx.accounts.dc_fee_payer.to_account_info(),
          dc_mint: ctx.accounts.dc_mint.to_account_info(),
          token_program: ctx.accounts.token_program.to_account_info(),
          associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
          system_program: ctx.accounts.system_program.to_account_info(),
        },
      },
    ),
    BurnWithoutTrackingArgsV0 { amount: dc_fee },
  )?;

  if ctx.accounts.mobile_info.is_active {
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
  }
  Ok(())
}
