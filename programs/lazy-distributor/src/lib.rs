use anchor_lang::prelude::*;

declare_id!("1azyvMnX9ptJgr8y18mhAJFQSHfFGjyGtPQ4Lnn99kj");

pub mod circuit_breaker;
pub mod error;
pub mod instructions;
pub mod state;
pub mod token_metadata;

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

  pub fn initialize_compression_recipient_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, InitializeCompressionRecipientV0<'info>>,
    args: InitializeCompressionRecipientArgsV0,
  ) -> Result<()> {
    initialize_compression_recipient_v0::handler(ctx, args)
  }

  pub fn set_current_rewards_v0(ctx: Context<SetRewardsV0>, args: SetRewardsArgsV0) -> Result<()> {
    set_current_rewards_v0::handler(ctx, args)
  }

  pub fn distribute_rewards_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, DistributeRewardsV0<'info>>,
  ) -> Result<()> {
    distribute_rewards_v0::handler(ctx)
  }

  pub fn distribute_compression_rewards_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, DistributeCompressionRewardsV0<'info>>,
    args: DistributeCompressionRewardsArgsV0,
  ) -> Result<()> {
    distribute_compression_rewards_v0::handler(ctx, args)
  }
}
