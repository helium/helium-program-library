use anchor_lang::prelude::*;
#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

declare_id!("dce4jeLBpfaFsNAKMAmVt5Py4E1R4mZcrVvMB5ejvGu");

pub mod errors;
pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::*;

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
  name: "Conversion Escrow",
  project_url: "http://helium.com",
  contacts: "email:hello@helium.foundation",
  policy: "https://github.com/helium/helium-program-library/tree/master/SECURITY.md",


  // Optional Fields
  preferred_languages: "en",
  source_code: "https://github.com/helium/helium-program-library/tree/master/programs/conversion-escrow",
  source_revision: default_env!("GITHUB_SHA", ""),
  source_release: default_env!("GITHUB_REF_NAME", ""),
  auditors: "Sec3"
}

#[program]
pub mod conversion_escrow {
  use super::*;

  pub fn initialize_escrow_v0(
    ctx: Context<InitializeEscrowV0>,
    args: InitializeEscrowArgsV0,
  ) -> Result<()> {
    instructions::initialize_escrow_v0::handler(ctx, args)
  }

  /// Lends funds to the lendee, assuming they repay in enough data credits to `owner` DC account
  pub fn lend_v0(ctx: Context<LendV0>, args: LendArgsV0) -> Result<()> {
    instructions::lend_v0::handler(ctx, args)
  }
}
