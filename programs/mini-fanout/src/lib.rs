use anchor_lang::prelude::*;
#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

declare_id!("mfanLprNnaiP4RX9Zz1BMcDosYHCqnG24H1fMEbi9Gn");

pub mod errors;
pub mod instructions;
pub mod resize_to_fit;
pub mod state;

pub use instructions::*;
pub use state::*;

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
  name: "Mini Fanout",
  project_url: "http://helium.com",
  contacts: "email:hello@helium.foundation",
  policy: "https://github.com/helium/helium-program-library/tree/master/SECURITY.md",

  // Optional Fields
  preferred_languages: "en",
  source_code: "https://github.com/helium/helium-program-library/tree/master/programs/mini-fanout",
  source_revision: default_env!("GITHUB_SHA", ""),
  source_release: default_env!("GITHUB_REF_NAME", ""),
  auditors: "Sec3"
}

#[program]
pub mod mini_fanout {
  use super::*;

  pub fn initialize_mini_fanout_v0(
    ctx: Context<InitializeMiniFanoutV0>,
    args: InitializeMiniFanoutArgsV0,
  ) -> Result<()> {
    instructions::initialize_mini_fanout_v0::handler(ctx, args)
  }

  pub fn distribute_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, DistributeV0<'info>>,
  ) -> Result<tuktuk_program::RunTaskReturnV0> {
    instructions::distribute_v0::handler(ctx)
  }

  pub fn schedule_task_v0(ctx: Context<ScheduleTaskV0>, args: ScheduleTaskArgsV0) -> Result<()> {
    instructions::schedule_task_v0::handler(ctx, args)
  }

  pub fn update_mini_fanout_v0(
    ctx: Context<UpdateMiniFanoutV0>,
    args: UpdateMiniFanoutArgsV0,
  ) -> Result<()> {
    instructions::update_mini_fanout_v0::handler(ctx, args)
  }

  pub fn close_mini_fanout_v0(ctx: Context<CloseMiniFanoutV0>) -> Result<()> {
    instructions::close_mini_fanout_v0::handler(ctx)
  }
}
