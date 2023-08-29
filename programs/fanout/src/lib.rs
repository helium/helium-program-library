use anchor_lang::prelude::*;
#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

declare_id!("fanqeMu3fw8R4LwKNbahPtYXJsyLL6NXyfe2BqzhfB6");

pub mod errors;
pub mod instructions;
pub mod state;

pub use errors::*;
pub use instructions::*;
pub use state::*;

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
  name: "Fanout",
  project_url: "http://helium.com",
  contacts: "email:hello@helium.foundation",

  // Optional Fields
  preferred_languages: "en",
  source_code: "https://github.com/helium/helium-program-library/tree/master/programs/fanout",
  source_revision: default_env!("GITHUB_SHA", ""),
  source_release: default_env!("GITHUB_REF_NAME", ""),
  auditors: "Sec3"
}

#[program]
pub mod fanout {
  use super::*;

  pub fn initialize_fanout_v0(
    ctx: Context<InitializeFanoutV0>,
    args: InitializeFanoutArgsV0,
  ) -> Result<()> {
    instructions::initialize_fanout_v0::handler(ctx, args)
  }

  pub fn stake_v0(ctx: Context<StakeV0>, args: StakeArgsV0) -> Result<()> {
    instructions::stake_v0::handler(ctx, args)
  }

  pub fn unstake_v0(ctx: Context<UnstakeV0>) -> Result<()> {
    instructions::unstake_v0::handler(ctx)
  }

  pub fn distribute_v0(ctx: Context<DistributeV0>) -> Result<()> {
    instructions::distribute_v0::handler(ctx)
  }
}
