use anchor_lang::prelude::*;

declare_id!("8DV471AvMNBCDTPoa2gzffrYFEJmDU56GDgTBv48RBZR");

pub mod error;
pub mod instructions;
pub mod state;
pub mod token_metadata;

pub use instructions::*;
pub use state::*;

#[program]
pub mod hotspot_issuance {
  use super::*;

  pub fn initialize_hotspot_config_v0(
    ctx: Context<InitializeHotspotConfigV0>,
    args: InitializeHotspotConfigV0Args,
  ) -> Result<()> {
    initialize_hotspot_config_v0::handler(ctx, args)
  }

  pub fn initialize_hotspot_issuer_v0(
    ctx: Context<InitializeHotspotIssuerV0>,
    args: InitializeHotspotIssuerV0Args,
  ) -> Result<()> {
    initialize_hotspot_issuer_v0::handler(ctx, args)
  }

  pub fn issue_hotspot_v0(
    ctx: Context<IssueHotspotV0>,
    args: IssueHotspotV0Args,
  ) -> Result<()> {
    issue_hotspot_v0::handler(ctx, args)
  }
}
