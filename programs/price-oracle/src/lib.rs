use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

pub mod error;
pub mod instructions;
pub mod state;
pub mod utils;

pub use instructions::*;
pub use state::*;
pub use utils::*;

#[program]
pub mod price_oracle {
  use super::*;

  pub fn initialize_price_oracle_v0(
    ctx: Context<InitializePriceOracleV0>,
    args: InitializePriceOracleArgsV0,
  ) -> Result<()> {
    initialize_price_oracle_v0::handler(ctx, args)
  }

  pub fn submit_price_v0(ctx: Context<SubmitPriceV0>, args: SubmitPriceArgsV0) -> Result<()> {
    submit_price_v0::handler(ctx, args)
  }

  pub fn update_price_v0(ctx: Context<UpdatePriceV0>) -> Result<()> {
    update_price_v0::handler(ctx)
  }
}

#[derive(Accounts)]
pub struct Initialize {}
