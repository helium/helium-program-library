use anchor_lang::prelude::*;
#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

pub mod errors;
pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::*;

// Devnet uses a different program id: the mainnet program keypair was lost, so
// devnet is deployed from a separately ground keypair.
#[cfg(feature = "devnet")]
declare_id!("tdcaoktKw6bDQ5ukLq5fLtje2kCkmHX7Sj9G77jY5dh");
#[cfg(not(feature = "devnet"))]
declare_id!("tdcam4m5U74pEZQrsQ7fVAav4AUXXc6z8fkhvExfRVN");

// A TESTING build substitutes test values for production ones, so it must never be
// mistaken for a deployable program on any cluster. TESTING on its own can arrive from an
// inherited environment; HELIUM_TEST_BUILD is set only by a build that means to be a test
// build. A deployable program refuses to compile when the two disagree.
#[cfg(all(not(feature = "no-entrypoint"), not(feature = "idl-build"), not(test)))]
const _: () = {
  if option_env!("TESTING").is_some() && option_env!("HELIUM_TEST_BUILD").is_none() {
    panic!(
      "TESTING is set without HELIUM_TEST_BUILD; a deployable program must not use test values. A deliberate test build sets both."
    );
  }
};

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

  pub fn swap_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, SwapV0<'info>>,
    args: SwapArgsV0,
  ) -> Result<()> {
    instructions::swap_v0::handler(ctx, args)
  }

  pub fn check_repay_v0(
    ctx: Context<CheckRepayV0>,
    args: CheckRepayArgsV0,
  ) -> Result<tuktuk_program::RunTaskReturnV0> {
    instructions::check_repay_v0::handler(ctx, args)
  }
}
