use anchor_lang::prelude::*;

declare_id!("hemABtqNUst4MmqsVcuN217ZzBspENbGt9uueSe5jts");

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;
pub mod token_metadata;

pub use instructions::*;
pub use state::*;

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

  pub fn initialize_maker_v0(
    ctx: Context<InitializeMakerV0>,
    args: InitializeMakerArgsV0,
  ) -> Result<()> {
    initialize_maker_v0::handler(ctx, args)
  }

  pub fn issue_entity_v0(ctx: Context<IssueEntityV0>, args: IssueEntityArgsV0) -> Result<()> {
    issue_entity_v0::handler(ctx, args)
  }

  pub fn genesis_issue_hotspot_v0(
    ctx: Context<GenesisIssueHotspotV0>,
    args: GenesisIssueHotspotArgsV0,
  ) -> Result<()> {
    genesis_issue_hotspot_v0::handler(ctx, args)
  }

  pub fn onboard_iot_hotspot_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, OnboardIotHotspotV0<'info>>,
    args: OnboardIotHotspotArgsV0,
  ) -> Result<()> {
    onboard_iot_hotspot_v0::handler(ctx, args)
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

  pub fn update_iot_info_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, UpdateIotInfoV0<'info>>,
    args: UpdateIotInfoArgsV0,
  ) -> Result<()> {
    update_iot_info_v0::handler(ctx, args)
  }
}
