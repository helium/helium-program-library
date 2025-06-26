use anchor_lang::prelude::*;
#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

declare_id!("we1cGnTxTkDP9Sk49dw1d3T7ik7V2NfnY4qDGCDHXfC");

pub mod error;
pub mod instructions;
pub mod state;
pub mod utils;

pub use instructions::*;
pub use state::*;

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
  name: "Welcome Pack",
  project_url: "http://helium.com",
  contacts: "email:hello@helium.foundation",
  policy: "https://github.com/helium/helium-program-library/tree/master/SECURITY.md",

  // Optional Fields
  preferred_languages: "en",
  source_code: "https://github.com/helium/helium-program-library/tree/master/programs/welcome-pack",
  source_revision: default_env!("GITHUB_SHA", ""),
  source_release: default_env!("GITHUB_REF_NAME", ""),
  auditors: "Sec3"
}

#[program]
pub mod welcome_pack {
  use super::*;

  pub fn initialize_welcome_pack_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, InitializeWelcomePackV0<'info>>,
    args: InitializeWelcomePackArgsV0,
  ) -> Result<()> {
    initialize_welcome_pack_v0::handler(ctx, args)
  }

  pub fn claim_welcome_pack_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, ClaimWelcomePackV0<'info>>,
    args: ClaimWelcomePackArgsV0,
  ) -> Result<()> {
    claim_welcome_pack_v0::handler(ctx, args)
  }

  pub fn close_welcome_pack_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, CloseWelcomePackV0<'info>>,
    args: CloseWelcomePackArgsV0,
  ) -> Result<()> {
    close_welcome_pack_v0::handler(ctx, args)
  }
}
