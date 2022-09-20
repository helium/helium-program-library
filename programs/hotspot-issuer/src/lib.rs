use anchor_lang::prelude::*;

declare_id!("mXiWEGtETaoSV4e9VgVg9i5Atf95DRN7Pn3L9dXLi6A");

pub mod error;
pub mod instructions;
pub mod state;
pub mod utils;

pub use instructions::*;
pub use state::*;

#[program]
pub mod hotspot_issuer {
  use super::*;

  pub fn initialize_hotspot_issuer_v0(
    ctx: Context<InitializeHotspotIssuerV0>,
    args: InitializeHotspotIssuerV0Args,
  ) -> Result<()> {
    initialize_hotspot_issuer_v0::handler(ctx, args)
  }

  pub fn mint_and_claim_hotspot_v0(
    ctx: Context<MintAndClaimHotspotV0>,
    args: MintAndClaimHotspotV0Args,
  ) -> Result<()> {
    mint_and_claim_hotspot_v0::handler(ctx, args)
  }
}
