use anchor_lang::prelude::*;

pub mod instructions;
pub use instructions::*;

declare_id!("5BAQuzGE1z8CTcrSdfbfdBF2fdXrwb4iMcxDMrvhz8L8");

#[program]
pub mod data_credits {
  use super::*;

  pub fn mint_data_credits_v0(
    ctx: Context<MintDataCreditsV0>,
    args: MintDataCreditsV0Args,
  ) -> Result<()> {
    instructions::mint_data_credits_v0::handler(ctx, args)
  }

  pub fn burn_data_credits_v0(ctx: Context<BurnDataCreditsV0>) -> Result<()> {
    Ok(())
  }
}
