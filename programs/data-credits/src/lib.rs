use anchor_lang::prelude::*;

declare_id!("5BAQuzGE1z8CTcrSdfbfdBF2fdXrwb4iMcxDMrvhz8L8");

#[program]
pub mod data_credits {
  use super::*;

  pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    Ok(())
  }
}

#[derive(Accounts)]
pub struct Initialize {}
