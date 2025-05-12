use anchor_lang::prelude::*;
#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

declare_id!("sesD2P1SxjDDo6Z9wGrymwmkx3Z1EZdyL9H5tk7iaNg");

pub mod errors;
pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::*;

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
  name: "Sessions",
  project_url: "http://helium.com",
  contacts: "email:hello@helium.foundation",
  policy: "https://github.com/helium/helium-program-library/tree/master/SECURITY.md",

  // Optional Fields
  preferred_languages: "en",
  source_code: "https://github.com/helium/helium-program-library/tree/master/programs/sessions",
  source_revision: default_env!("GITHUB_SHA", ""),
  source_release: default_env!("GITHUB_REF_NAME", ""),
  auditors: "Sec3"
}

#[program]
pub mod sessions {
  use super::*;

  pub fn initialize_session_manager_v0(
    ctx: Context<InitializeSessionManagerV0>,
    args: InitializeSessionManagerArgsV0,
  ) -> Result<()> {
    instructions::initialize_session_manager_v0::handler(ctx, args)
  }

  pub fn initialize_session_v0(
    ctx: Context<InitializeSessionV0>,
    args: InitializeSessionArgsV0,
  ) -> Result<()> {
    instructions::initialize_session_v0::handler(ctx, args)
  }

  pub fn close_session_v0(ctx: Context<CloseSessionV0>) -> Result<()> {
    instructions::close_session_v0::handler(ctx)
  }
}
