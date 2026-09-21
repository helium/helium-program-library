use anchor_lang::prelude::*;
#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

pub mod errors;
pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::*;

declare_id!("topqqzQZroCyRrgyM5zVq6xkFDVnfF13iixSjajydgU");

// A TESTING build substitutes test values for production ones, so it must never be
// mistaken for a deployable mainnet program. TESTING on its own can arrive from an
// inherited environment; HELIUM_TEST_BUILD is set only by a build that means to be a test
// build. The deployable mainnet program refuses to compile when the two disagree.
#[cfg(all(
  not(feature = "devnet"),
  not(feature = "no-entrypoint"),
  not(feature = "idl-build"),
  not(test)
))]
const _: () = {
  if option_env!("TESTING").is_some() && option_env!("HELIUM_TEST_BUILD").is_none() {
    panic!(
      "TESTING is set without HELIUM_TEST_BUILD; a mainnet build must not use test values. A deliberate test build sets both."
    );
  }
};

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
  name: "Data Credits Auto Top",
  project_url: "https://github.com/helium/helium-program-library/tree/master/programs/dc-auto-top",
  contacts: "email:hello@helium.foundation",
  policy: "https://github.com/helium/helium-program-library/tree/master/SECURITY.md",


  // Optional Fields
  preferred_languages: "en",
  source_code: "https://github.com/helium/helium-program-library/tree/master/programs/dc-auto-top",
  source_revision: default_env!("GITHUB_SHA", ""),
  source_release: default_env!("GITHUB_REF_NAME", ""),
  auditors: "Sec3"
}

#[program]
pub mod dc_auto_top {
  use super::*;

  pub fn schedule_task_v0(ctx: Context<ScheduleTaskV0>, args: ScheduleTaskArgsV0) -> Result<()> {
    instructions::schedule_task_v0::handler(ctx, args)
  }

  pub fn top_off_dc_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, TopOffDcV0<'info>>,
  ) -> Result<tuktuk_program::RunTaskReturnV0> {
    instructions::top_off_dc_v0::handler(ctx)
  }

  pub fn top_off_hnt_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, TopOffHntV0<'info>>,
  ) -> Result<tuktuk_program::RunTaskReturnV0> {
    instructions::top_off_hnt_v0::handler(ctx)
  }

  pub fn update_auto_top_off_v0(
    ctx: Context<UpdateAutoTopOffV0>,
    args: UpdateAutoTopOffArgsV0,
  ) -> Result<()> {
    instructions::update_auto_top_off_v0::handler(ctx, args)
  }

  pub fn close_auto_top_off_v0(ctx: Context<CloseAutoTopOffV0>) -> Result<()> {
    instructions::close_auto_top_off_v0::handler(ctx)
  }

  pub fn initialize_auto_top_off_v0(
    ctx: Context<InitializeAutoTopOffV0>,
    args: InitializeAutoTopOffArgsV0,
  ) -> Result<()> {
    instructions::initialize_auto_top_off_v0::handler(ctx, args)
  }

  pub fn close_dca_v0(ctx: Context<CloseDcaV0>) -> Result<()> {
    instructions::close_dca_v0::handler(ctx)
  }

  pub fn close_legacy_auto_top_off(ctx: Context<CloseLegacyAutoTopOff>) -> Result<()> {
    instructions::close_legacy_auto_top_off::handler(ctx)
  }
}
