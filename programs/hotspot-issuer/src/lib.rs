use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

pub mod error;
pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::*;

#[program]
pub mod hotspot_issuer {
  use super::*;

  pub fn initialize(ctx: Context<InitializeHotspotIssuerV0>) -> Result<()> {
    Ok(())
  }
}