use anchor_lang::prelude::*;

declare_id!("treaf4wWBBty3fHdyBpo35Mz84M8k3heKXmjmi9vFt5");

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

  pub fn initialize_treasury_management_v0(
    ctx: Context<InitializeTreasuryManagementV0>,
    args: InitializeTreasuryManagementArgsV0,
  ) -> Result<()> {
    initialize_treasury_management_v0::handler(ctx, args)
  }

  pub fn update_treasury_management_v0(
    ctx: Context<UpdateTreasuryManagementV0>,
    args: UpdateTreasuryManagementArgsV0,
  ) -> Result<()> {
    update_treasury_management_v0::handler(ctx, args)
  }

  pub fn redeem_v0(ctx: Context<RedeemV0>, args: RedeemArgsV0) -> Result<()> {
    redeem_v0::handler(ctx, args)
  }

  pub fn correct_treasuries_v0(
    ctx: Context<CorrectTreasuriesV0>,
  ) -> Result<()> {
    correct_treasuries_v0::handler(ctx)
  }
}
