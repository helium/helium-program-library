use anchor_lang::prelude::*;
#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

declare_id!("circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g");

pub mod errors;
pub mod instructions;
pub mod state;
pub mod window;

pub use errors::*;
pub use instructions::*;
pub use state::*;

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
  name: "Circuit Breaker",
  project_url: "http://helium.com",
  contacts: "email:hello@helium.foundation",

  // Optional Fields
  preferred_languages: "en",
  source_code: "https://github.com/helium/helium-program-library/tree/master/programs/circuit-breaker",
  source_revision: default_env!("GITHUB_SHA", ""),
  source_release: default_env!("GITHUB_REF_NAME", ""),
  auditors: "Sec3"
}

#[derive(Clone)]
pub struct CircuitBreaker;

impl anchor_lang::Id for CircuitBreaker {
  fn id() -> Pubkey {
    crate::id()
  }
}

#[program]
pub mod circuit_breaker {
  use super::*;

  pub fn initialize_mint_windowed_breaker_v0(
    ctx: Context<InitializeMintWindowedBreakerV0>,
    args: InitializeMintWindowedBreakerArgsV0,
  ) -> Result<()> {
    instructions::initialize_mint_windowed_breaker_v0::handler(ctx, args)
  }

  pub fn initialize_account_windowed_breaker_v0(
    ctx: Context<InitializeAccountWindowedBreakerV0>,
    args: InitializeAccountWindowedBreakerArgsV0,
  ) -> Result<()> {
    instructions::initialize_account_windowed_breaker_v0::handler(ctx, args)
  }

  pub fn mint_v0(ctx: Context<MintV0>, args: MintArgsV0) -> Result<()> {
    instructions::mint_v0::handler(ctx, args)
  }

  pub fn transfer_v0(ctx: Context<TransferV0>, args: TransferArgsV0) -> Result<()> {
    instructions::transfer_v0::handler(ctx, args)
  }

  pub fn update_account_windowed_breaker_v0(
    ctx: Context<UpdateAccountWindowedBreakerV0>,
    args: UpdateAccountWindowedBreakerArgsV0,
  ) -> Result<()> {
    instructions::update_account_windowed_breaker_v0::handler(ctx, args)
  }

  pub fn update_mint_windowed_breaker_v0(
    ctx: Context<UpdateMintWindowedBreakerV0>,
    args: UpdateMintWindowedBreakerArgsV0,
  ) -> Result<()> {
    instructions::update_mint_windowed_breaker_v0::handler(ctx, args)
  }
}
