use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

pub mod error;
pub mod instructions;
pub mod state;
pub mod token_metadata;
pub mod utils;

pub use state::*;
pub use instructions::*;

#[program]
pub mod lazy_distributor {
  use super::*;

  pub fn initialize_lazy_distributor_v0(
    ctx: Context<InitializeLazyDistributorV0>,
    args: InitializeLazyDistributorV0Args,
  ) -> Result<()> {
    initialize_lazy_distributor_v0::handler(ctx, args)
  }

  pub fn initialize_recipient_v0(
    ctx: Context<InitializeRecipientV0>,
  ) -> Result<()> {
    initialize_recipient_v0::handler(ctx)
  }

  pub fn set_current_rewards_v0(
    ctx: Context<SetRewardsV0>,
    args: SetRewardsV0Args
  ) -> Result<()> {
    set_current_rewards_v0::handler(ctx, args)
  }
}
