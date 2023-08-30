use anchor_lang::prelude::*;
#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

declare_id!("memMa1HG4odAFmUbGWfPwS1WWfK95k99F2YTkGvyxZr");

pub mod error;
pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::*;

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
  name: "Mobile Entity Manager",
  project_url: "http://helium.com",
  contacts: "email:hello@helium.foundation",

  // Optional Fields
  preferred_languages: "en",
  source_code: "https://github.com/helium/helium-program-library/tree/master/programs/mobile-entity-manager",
  source_revision: default_env!("GITHUB_SHA", ""),
  source_release: default_env!("GITHUB_REF_NAME", ""),
  auditors: "Sec3"
}

#[program]
pub mod mobile_entity_manager {
  use super::*;

  pub fn approve_carrier_v0(ctx: Context<ApproveCarrierV0>) -> Result<()> {
    approve_carrier_v0::handler(ctx)
  }

  pub fn initialize_carrier_v0(
    ctx: Context<InitializeCarrierV0>,
    args: InitializeCarrierArgsV0,
  ) -> Result<()> {
    initialize_carrier_v0::handler(ctx, args)
  }

  pub fn initialize_subscriber_v0(
    ctx: Context<InitializeSubscriberV0>,
    args: InitializeSubscriberArgsV0,
  ) -> Result<()> {
    initialize_subscriber_v0::handler(ctx, args)
  }

  pub fn issue_carrier_nft_v0(
    ctx: Context<IssueCarrierNftV0>,
    args: IssueCarrierNftArgsV0,
  ) -> Result<()> {
    issue_carrier_nft_v0::handler(ctx, args)
  }

  pub fn revoke_carrier_v0(ctx: Context<RevokeCarrierV0>) -> Result<()> {
    revoke_carrier_v0::handler(ctx)
  }

  pub fn update_carrier_tree_v0(
    ctx: Context<UpdateCarrierTreeV0>,
    args: UpdateCarrierTreeArgsV0,
  ) -> Result<()> {
    update_carrier_tree_v0::handler(ctx, args)
  }
}
