use anchor_lang::prelude::*;

declare_id!("circcmKGcSE61r768bFtD1GkG3x6qfEE1GD2PgwA6C3");

pub mod errors;
pub mod instructions;
pub mod state;
pub mod window;

pub use errors::*;
pub use instructions::*;
pub use state::*;

#[program]
pub mod circuit_breaker {
  use super::*;

  pub fn initialize_mint_windowed_breaker_v0(
    ctx: Context<InitializeMintWindowedBreakerV0>,
    args: InitializeMintWindowedBreakerArgsV0,
  ) -> Result<()> {
    instructions::initialize_mint_windowed_breaker_v0::handler(ctx, args)
  }

  pub fn mint_v0(ctx: Context<MintV0>, args: MintArgsV0) -> Result<()> {
    instructions::mint_v0::handler(ctx, args)
  }
}
