use anchor_lang::prelude::*;

declare_id!("treaRzaa4b98D1NQMQdQXzBupbgWhyJ2e1pXhJzkTwU");

pub mod circuit_breaker;
pub mod curve;
pub mod error;
pub mod instructions;
pub mod state;
pub mod utils;

pub use instructions::*;
pub use state::*;

#[derive(Clone)]
pub struct TreasuryManagement;

impl anchor_lang::Id for TreasuryManagement {
  fn id() -> Pubkey {
    crate::id()
  }
}

#[program]
pub mod treasury_management {
  use super::*;

  pub fn initialize_treasury_management_v0<'info>(
    ctx: Context<InitializeTreasuryManagementV0<'info>>,
    args: InitializeTreasuryManagementArgsV0,
  ) -> Result<()> {
    initialize_treasury_management_v0::handler(ctx, args)
  }

  pub fn update_treasury_management_v0<'info>(
    ctx: Context<UpdateTreasuryManagementV0<'info>>,
    args: UpdateTreasuryManagementArgsV0,
  ) -> Result<()> {
    update_treasury_management_v0::handler(ctx, args)
  }

  pub fn redeem_v0<'info>(ctx: Context<RedeemV0<'info>>, args: RedeemArgsV0) -> Result<()> {
    redeem_v0::handler(ctx, args)
  }
}
