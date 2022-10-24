use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

pub mod error;
pub mod instructions;
pub mod state;
pub mod token_metadata;
pub mod circuit_breaker;

pub use instructions::*;
pub use state::*;

#[program]
pub mod lazy_distributor {
  use super::*;

  pub fn initialize_lazy_distributor_v0(
    ctx: Context<InitializeLazyDistributorV0>,
    args: InitializeLazyDistributorArgsV0,
  ) -> Result<()> {
    initialize_lazy_distributor_v0::handler(ctx, args)
  }

  pub fn initialize_recipient_v0(ctx: Context<InitializeRecipientV0>) -> Result<()> {
    initialize_recipient_v0::handler(ctx)
  }

  pub fn set_current_rewards_v0(ctx: Context<SetRewardsV0>, args: SetRewardsArgsV0) -> Result<()> {
    set_current_rewards_v0::handler(ctx, args)
  }

  pub fn distribute_rewards_v0(ctx: Context<DistributeRewardsV0>) -> Result<()> {
    distribute_rewards_v0::handler(ctx)
  }
}
