use anchor_lang::prelude::*;
#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

declare_id!("hexbnKYoA2GercNNhHUCCfrTRWrHjT6ujKPXTa5NPqJ");

pub mod error;
pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::*;

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
  name: "Hexboosting",
  project_url: "http://helium.com",
  contacts: "email:hello@helium.foundation",
  policy: "https://github.com/helium/helium-program-library/tree/master/SECURITY.md",


  // Optional Fields
  preferred_languages: "en",
  source_code: "https://github.com/helium/helium-program-library/tree/master/programs/hexboosting",
  source_revision: default_env!("GITHUB_SHA", ""),
  source_release: default_env!("GITHUB_REF_NAME", ""),
  auditors: "Sec3"
}

#[program]
pub mod hexboosting {
  use super::*;

  pub fn boost_v0(ctx: Context<BoostV0>, args: BoostArgsV0) -> Result<()> {
    boost_v0::handler(ctx, args)
  }

  pub fn initialize_boost_config_v0(
    ctx: Context<InitializeBoostConfigV0>,
    args: InitializeBoostConfigArgsV0,
  ) -> Result<()> {
    initialize_boost_config_v0::handler(ctx, args)
  }

  pub fn start_boost_v0(ctx: Context<StartBoostV0>, args: StartBoostArgsV0) -> Result<()> {
    start_boost_v0::handler(ctx, args)
  }

  pub fn start_boost_v1(ctx: Context<StartBoostV1>, args: StartBoostArgsV0) -> Result<()> {
    start_boost_v1::handler(ctx, args)
  }

  pub fn close_boost_v0(ctx: Context<CloseBoostV0>) -> Result<()> {
    close_boost_v0::handler(ctx)
  }

  pub fn close_boost_v1(ctx: Context<CloseBoostV1>) -> Result<()> {
    close_boost_v1::handler(ctx)
  }

  pub fn update_boost_config_v0(
    ctx: Context<UpdateBoostConfigV0>,
    args: UpdateBoostConfigArgsV0,
  ) -> Result<()> {
    update_boost_config_v0::handler(ctx, args)
  }
}
