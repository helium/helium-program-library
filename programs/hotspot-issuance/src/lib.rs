use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

pub mod error;
pub mod instructions;
pub mod state;
pub mod utils;

pub use instructions::*;
pub use state::*;

#[program]
pub mod hotspot_issuer {
  use super::*;

  pub fn initialize_hotspot_issuance_v0(
    ctx: Context<InitializeHotspotIssuanceV0>, 
    args: InitializeHotspotIssuanceV0Args
  ) -> Result<()> {
    initialize_hotspot_issuance_v0::handler(ctx, args)
  }

  pub fn mint_and_claim_hotspot_v0(
    ctx: Context<MintAndClaimHotspotV0>, 
    args: MintAndClaimHotspotV0Args
  ) -> Result<()> {
    mint_and_claim_hotspot_v0::handler(ctx, args)
  }
}