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
}

#[derive(Accounts)]
pub struct Initialize {}
