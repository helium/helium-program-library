use anchor_lang::prelude::*;

declare_id!("fanqeMu3fw8R4LwKNbahPtYXJsyLL6NXyfe2BqzhfB6");

pub mod errors;
pub mod instructions;
pub mod state;

pub use errors::*;
pub use instructions::*;
pub use state::*;

#[program]
pub mod fanout {
  use super::*;

  pub fn initialize_fanout_v0(
    ctx: Context<InitializeFanoutV0>,
    args: InitializeFanoutArgsV0,
  ) -> Result<()> {
    instructions::initialize_fanout_v0::handler(ctx, args)
  }

  pub fn stake_v0(ctx: Context<StakeV0>) -> Result<()> {
    instructions::stake_v0::handler(ctx)
  }

  pub fn unstake_v0(ctx: Context<UnstakeV0>) -> Result<()> {
    instructions::unstake_v0::handler(ctx)
  }

  pub fn distribute_v0(ctx: Context<DistributeV0>) -> Result<()> {
    instructions::distribute_v0::handler(ctx)
  }
}
