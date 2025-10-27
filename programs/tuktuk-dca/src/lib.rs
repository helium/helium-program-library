use anchor_lang::prelude::*;
#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

pub mod errors;
pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::*;

declare_id!("tdcam4m5U74pEZQrsQ7fVAav4AUXXc6z8fkhvExfRVN");

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
  name: "Tuktuk DCA",
  project_url: "https://github.com/helium/helium-program-library/tree/master/programs/tuktuk-dca",
  contacts: "email:hello@helium.foundation",
  policy: "https://github.com/helium/helium-program-library/tree/master/SECURITY.md",


  // Optional Fields
  preferred_languages: "en",
  source_code: "https://github.com/helium/helium-program-library/tree/master/programs/tuktuk-dca",
  source_revision: default_env!("GITHUB_SHA", ""),
  source_release: default_env!("GITHUB_REF_NAME", ""),
  auditors: "Sec3"
}

#[program]
pub mod tuktuk_dca {
  use super::*;

  pub fn initialize_dca_v0(ctx: Context<InitializeDcaV0>, args: InitializeDcaArgsV0) -> Result<()> {
    instructions::initialize_dca_v0::handler(ctx, args)
  }

  pub fn initialize_dca_nested_v0(
    ctx: Context<InitializeDcaNestedV0>,
    args: InitializeDcaArgsV0,
  ) -> Result<tuktuk_program::RunTaskReturnV0> {
    instructions::initialize_dca_v0::handler_nested(ctx, args)
  }

  pub fn close_dca_v0(ctx: Context<CloseDcaV0>) -> Result<()> {
    instructions::close_dca_v0::handler(ctx)
  }

  pub fn lend_v0(ctx: Context<LendV0>) -> Result<()> {
    instructions::lend_v0::handler(ctx)
  }

  pub fn check_repay_v0(
    ctx: Context<CheckRepayV0>,
    args: CheckRepayArgsV0,
  ) -> Result<tuktuk_program::RunTaskReturnV0> {
    instructions::check_repay_v0::handler(ctx, args)
  }
}
