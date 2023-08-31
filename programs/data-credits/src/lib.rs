use anchor_lang::prelude::*;
#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

pub mod circuit_breaker;
pub mod errors;
pub mod instructions;
pub mod state;

pub use errors::*;
pub use instructions::*;
pub use state::*;

declare_id!("credMBJhYFzfn7NxBMdU4aUqFggAjgztaCcv2Fo6fPT");

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
  name: "Data Credits",
  project_url: "http://helium.com",
  contacts: "email:hello@helium.foundation",
  policy: "https://github.com/helium/helium-program-library/tree/master/SECURITY.md",

  // Optional Fields
  preferred_languages: "en",
  source_code: "https://github.com/helium/helium-program-library/tree/master/programs/data-credits",
  source_revision: default_env!("GITHUB_SHA", ""),
  source_release: default_env!("GITHUB_REF_NAME", ""),
  auditors: "Sec3"
}

#[program]
pub mod data_credits {
  use super::*;

  pub fn initialize_data_credits_v0(
    ctx: Context<InitializeDataCreditsV0>,
    args: InitializeDataCreditsArgsV0,
  ) -> Result<()> {
    instructions::initialize_data_credits_v0::handler(ctx, args)
  }

  pub fn mint_data_credits_v0(
    ctx: Context<MintDataCreditsV0>,
    args: MintDataCreditsArgsV0,
  ) -> Result<()> {
    instructions::mint_data_credits_v0::handler(ctx, args)
  }

  pub fn issue_data_credits_v0(
    ctx: Context<IssueDataCreditsV0>,
    args: IssueDataCreditsArgsV0,
  ) -> Result<()> {
    instructions::issue_data_credits_v0::handler(ctx, args)
  }

  pub fn genesis_issue_delegated_data_credits_v0(
    ctx: Context<GenesisIssueDelegatedDataCreditsV0>,
    args: GenesisIssueDelegatedDataCreditsArgsV0,
  ) -> Result<()> {
    instructions::genesis_issue_delegated_data_credits_v0::handler(ctx, args)
  }

  pub fn burn_delegated_data_credits_v0(
    ctx: Context<BurnDelegatedDataCreditsV0>,
    args: BurnDelegatedDataCreditsArgsV0,
  ) -> Result<()> {
    instructions::burn_delegated_data_credits_v0::handler(ctx, args)
  }

  pub fn burn_without_tracking_v0(
    ctx: Context<BurnWithoutTrackingV0>,
    args: BurnWithoutTrackingArgsV0,
  ) -> Result<()> {
    instructions::burn_without_tracking_v0::handler(ctx, args)
  }

  pub fn delegate_data_credits_v0(
    ctx: Context<DelegateDataCreditsV0>,
    args: DelegateDataCreditsArgsV0,
  ) -> Result<()> {
    instructions::delegate_data_credits_v0::handler(ctx, args)
  }

  pub fn update_data_credits_v0(
    ctx: Context<UpdateDataCreditsV0>,
    args: UpdateDataCreditsArgsV0,
  ) -> Result<()> {
    instructions::update_data_credits_v0::handler(ctx, args)
  }

  pub fn change_delegated_sub_dao_v0(
    ctx: Context<ChangeDelegatedSubDaoV0>,
    args: ChangeDelegatedSubDaoArgsV0,
  ) -> Result<()> {
    instructions::change_delegated_sub_dao_v0::handler(ctx, args)
  }
}
