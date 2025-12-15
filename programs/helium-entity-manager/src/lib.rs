use anchor_lang::prelude::*;
#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

declare_id!("hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8");

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::*;

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
  name: "Helium Entity Manager",
  project_url: "http://helium.com",
  contacts: "email:hello@helium.foundation",
  policy: "https://github.com/helium/helium-program-library/tree/master/SECURITY.md",

  // Optional Fields
  preferred_languages: "en",
  source_code: "https://github.com/helium/helium-program-library/tree/master/programs/helium-entity-manager",
  source_revision: default_env!("GITHUB_SHA", ""),
  source_release: default_env!("GITHUB_REF_NAME", ""),
  auditors: "Sec3"
}

#[program]
pub mod helium_entity_manager {
  use super::*;

  pub fn initialize_rewardable_entity_config_v0(
    ctx: Context<InitializeRewardableEntityConfigV0>,
    args: InitializeRewardableEntityConfigArgsV0,
  ) -> Result<()> {
    initialize_rewardable_entity_config_v0::handler(ctx, args)
  }

  pub fn approve_maker_v0(ctx: Context<ApproveMakerV0>) -> Result<()> {
    approve_maker_v0::handler(ctx)
  }

  pub fn revoke_maker_v0(ctx: Context<RevokeMakerV0>) -> Result<()> {
    revoke_maker_v0::handler(ctx)
  }

  pub fn approve_program_v0(
    ctx: Context<ApproveProgramV0>,
    args: ApproveProgramArgsV0,
  ) -> Result<()> {
    approve_program_v0::handler(ctx, args)
  }

  pub fn revoke_program_v0(ctx: Context<RevokeProgramV0>, args: RevokeProgramArgsV0) -> Result<()> {
    revoke_program_v0::handler(ctx, args)
  }

  pub fn initialize_maker_v0(
    ctx: Context<InitializeMakerV0>,
    args: InitializeMakerArgsV0,
  ) -> Result<()> {
    initialize_maker_v0::handler(ctx, args)
  }

  pub fn issue_entity_v0(ctx: Context<IssueEntityV0>, args: IssueEntityArgsV0) -> Result<()> {
    issue_entity_v0::handler(ctx, args)
  }

  pub fn issue_program_entity_v0(
    ctx: Context<IssueProgramEntityV0>,
    args: IssueProgramEntityArgsV0,
  ) -> Result<()> {
    issue_program_entity_v0::handler(ctx, args)
  }

  pub fn issue_not_emitted_entity_v0(ctx: Context<IssueNotEmittedEntityV0>) -> Result<()> {
    issue_not_emitted_entity_v0::handler(ctx)
  }

  pub fn issue_iot_operations_fund_v0(ctx: Context<IssueIotOperationsFundV0>) -> Result<()> {
    issue_iot_operations_fund_v0::handler(ctx)
  }

  pub fn onboard_iot_hotspot_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, OnboardIotHotspotV0<'info>>,
    args: OnboardIotHotspotArgsV0,
  ) -> Result<()> {
    onboard_iot_hotspot_v0::handler(ctx, args)
  }

  pub fn onboard_mobile_hotspot_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, OnboardMobileHotspotV0<'info>>,
    args: OnboardMobileHotspotArgsV0,
  ) -> Result<()> {
    onboard_mobile_hotspot_v0::handler(ctx, args)
  }

  pub fn update_rewardable_entity_config_v0(
    ctx: Context<UpdateRewardableEntityConfigV0>,
    args: UpdateRewardableEntityConfigArgsV0,
  ) -> Result<()> {
    update_rewardable_entity_config_v0::handler(ctx, args)
  }

  pub fn update_maker_v0(ctx: Context<UpdateMakerV0>, args: UpdateMakerArgsV0) -> Result<()> {
    update_maker_v0::handler(ctx, args)
  }

  pub fn set_maker_tree_v0(ctx: Context<SetMakerTreeV0>, args: SetMakerTreeArgsV0) -> Result<()> {
    set_maker_tree_v0::handler(ctx, args)
  }

  pub fn update_maker_tree_v0(
    ctx: Context<UpdateMakerTreeV0>,
    args: UpdateMakerTreeArgsV0,
  ) -> Result<()> {
    update_maker_tree_v0::handler(ctx, args)
  }

  pub fn update_iot_info_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, UpdateIotInfoV0<'info>>,
    args: UpdateIotInfoArgsV0,
  ) -> Result<()> {
    update_iot_info_v0::handler(ctx, args)
  }

  pub fn update_mobile_info_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, UpdateMobileInfoV0<'info>>,
    args: UpdateMobileInfoArgsV0,
  ) -> Result<()> {
    update_mobile_info_v0::handler(ctx, args)
  }

  pub fn initialize_data_only_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, InitializeDataOnlyV0<'info>>,
    args: InitializeDataOnlyArgsV0,
  ) -> Result<()> {
    initialize_data_only_v0::handler(ctx, args)
  }

  pub fn issue_data_only_entity_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, IssueDataOnlyEntityV0<'info>>,
    args: IssueDataOnlyEntityArgsV0,
  ) -> Result<()> {
    issue_data_only_entity_v0::handler(ctx, args)
  }

  pub fn onboard_data_only_iot_hotspot_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, OnboardDataOnlyIotHotspotV0<'info>>,
    args: OnboardDataOnlyIotHotspotArgsV0,
  ) -> Result<()> {
    onboard_data_only_iot_hotspot_v0::handler(ctx, args)
  }

  pub fn update_data_only_tree_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, UpdateDataOnlyTreeV0<'info>>,
  ) -> Result<()> {
    update_data_only_tree_v0::handler(ctx)
  }

  pub fn set_entity_active_v0(
    ctx: Context<SetEntityActiveV0>,
    args: SetEntityActiveArgsV0,
  ) -> Result<()> {
    set_entity_active_v0::handler(ctx, args)
  }

  pub fn temp_pay_mobile_onboarding_fee_v0(
    ctx: Context<TempPayMobileOnboardingFeeV0>,
  ) -> Result<()> {
    temp_pay_mobile_onboarding_fee_v0::handler(ctx)
  }

  pub fn temp_standardize_entity<'info>(
    ctx: Context<'_, '_, '_, 'info, TempStandardizeEntity<'info>>,
    args: TempStandardizeEntityArgs,
  ) -> Result<()> {
    temp_standardize_entity::handler(ctx, args)
  }

  pub fn onboard_data_only_mobile_hotspot_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, OnboardDataOnlyMobileHotspotV0<'info>>,
    args: OnboardDataOnlyMobileHotspotArgsV0,
  ) -> Result<()> {
    onboard_data_only_mobile_hotspot_v0::handler(ctx, args)
  }

  pub fn temp_backfill_mobile_info<'info>(
    ctx: Context<'_, '_, '_, 'info, TempBackfillMobileInfo<'info>>,
    args: TempBackfillMobileInfoArgs,
  ) -> Result<()> {
    temp_backfill_mobile_info::handler(ctx, args)
  }

  pub fn swap_maker_stake(ctx: Context<SwapMakerStake>) -> Result<()> {
    swap_maker_stake::handler(ctx)
  }

  pub fn temp_close_key_to_asset_v0(ctx: Context<TempCloseKeyToAssetV0>) -> Result<()> {
    temp_close_key_to_asset_v0::handler(ctx)
  }
}
