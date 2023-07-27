use anchor_lang::prelude::*;

pub mod instructions;

pub use instructions::*;

declare_id!("rorcfdX4h9m9swCKgcypaHJ8NGYVANBpmV9EHn3cYrF");

#[program]
pub mod rewards_oracle {
  use super::*;

  pub fn set_current_rewards_wrapper_v0(
    ctx: Context<SetCurrentRewardsWrapperV0>,
    args: SetCurrentRewardsWrapperArgsV0,
  ) -> Result<()> {
    set_current_rewards_wrapper_v0::handler(ctx, args)
  }

  pub fn set_current_rewards_wrapper_v1(
    ctx: Context<SetCurrentRewardsWrapperV1>,
    args: SetCurrentRewardsWrapperArgsV1,
  ) -> Result<()> {
    set_current_rewards_wrapper_v1::handler(ctx, args)
  }
}
