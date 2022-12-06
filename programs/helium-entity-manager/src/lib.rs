use anchor_lang::prelude::*;

declare_id!("hemABtqNUst4MmqsVcuN217ZzBspENbGt9uueSe5jts");

pub mod error;
pub mod instructions;
pub mod state;
pub mod token_metadata;

pub use instructions::*;
pub use state::*;

#[program]
pub mod helium_entity_manager {
  use super::*;

  pub fn initialize_hotspot_config_v0(
    ctx: Context<InitializeHotspotConfigV0>,
    args: InitializeHotspotConfigArgsV0,
  ) -> Result<()> {
    initialize_hotspot_config_v0::handler(ctx, args)
  }

  pub fn initialize_hotspot_issuer_v0(
    ctx: Context<InitializeHotspotIssuerV0>,
    args: InitializeHotspotIssuerArgsV0,
  ) -> Result<()> {
    initialize_hotspot_issuer_v0::handler(ctx, args)
  }

  pub fn issue_iot_hotspot_v0(
    ctx: Context<IssueIotHotspotV0>,
    args: IssueIotHotspotArgsV0,
  ) -> Result<()> {
    issue_iot_hotspot_v0::handler(ctx, args)
  }

  pub fn genesis_issue_hotspot_v0(
    ctx: Context<GenesisIssueHotspotV0>,
    args: GenesisIssueHotspotArgsV0,
  ) -> Result<()> {
    genesis_issue_hotspot_v0::handler(ctx, args)
  }

  pub fn update_hotspot_config_v0(
    ctx: Context<UpdateHotspotConfigV0>,
    args: UpdateHotspotConfigArgsV0,
  ) -> Result<()> {
    update_hotspot_config_v0::handler(ctx, args)
  }

  pub fn update_hotspot_issuer_v0(
    ctx: Context<UpdateHotspotIssuerV0>,
    args: UpdateHotspotIssuerArgsV0,
  ) -> Result<()> {
    update_hotspot_issuer_v0::handler(ctx, args)
  }

  pub fn update_iot_info_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, UpdateIotInfoV0<'info>>,
    args: UpdateIotInfoArgsV0,
  ) -> Result<()> {
    update_iot_info_v0::handler(ctx, args)
  }
}
