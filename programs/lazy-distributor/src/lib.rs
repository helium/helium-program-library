use anchor_lang::prelude::*;
#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

declare_id!("1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w");

pub mod ed25519;
pub mod error;
pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::*;

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
  name: "Lazy Distributor",
  project_url: "http://helium.com",
  contacts: "email:hello@helium.foundation",
  policy: "https://github.com/helium/helium-program-library/tree/master/SECURITY.md",


  // Optional Fields
  preferred_languages: "en",
  source_code: "https://github.com/helium/helium-program-library/tree/master/programs/lazy-distributor",
  source_revision: default_env!("GITHUB_SHA", ""),
  source_release: default_env!("GITHUB_REF_NAME", ""),
  auditors: "Sec3"
}

#[program]
pub mod lazy_distributor {
  use super::*;

  pub fn initialize_lazy_distributor_v0(
    ctx: Context<InitializeLazyDistributorV0>,
    args: InitializeLazyDistributorArgsV0,
  ) -> Result<()> {
    initialize_lazy_distributor_v0::handler(ctx, args)
  }

  pub fn initialize_recipient_v0(ctx: Context<InitializeRecipientV0>) -> Result<()> {
    initialize_recipient_v0::handler(ctx)
  }

  pub fn initialize_compression_recipient_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, InitializeCompressionRecipientV0<'info>>,
    args: InitializeCompressionRecipientArgsV0,
  ) -> Result<()> {
    initialize_compression_recipient_v0::handler(ctx, args)
  }

  pub fn set_current_rewards_v0(
    ctx: Context<SetCurrentRewardsV0>,
    args: SetCurrentRewardsArgsV0,
  ) -> Result<()> {
    set_current_rewards_v0::handler(ctx, args)
  }

  pub fn distribute_rewards_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, DistributeRewardsV0<'info>>,
  ) -> Result<()> {
    distribute_rewards_v0::handler(ctx)
  }

  pub fn distribute_compression_rewards_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, DistributeCompressionRewardsV0<'info>>,
    args: DistributeCompressionRewardsArgsV0,
  ) -> Result<()> {
    distribute_compression_rewards_v0::handler(ctx, args)
  }

  pub fn update_lazy_distributor_v0(
    ctx: Context<UpdateLazyDistributorV0>,
    args: UpdateLazyDistributorArgsV0,
  ) -> Result<()> {
    update_lazy_distributor_v0::handler(ctx, args)
  }

  pub fn update_compression_destination_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, UpdateCompressionDestinationV0<'info>>,
    args: UpdateCompressionDestinationArgsV0,
  ) -> Result<()> {
    update_compression_destination_v0::handler(ctx, args)
  }

  pub fn update_destination_v0(ctx: Context<UpdateDestinationV0>) -> Result<()> {
    update_destination_v0::handler(ctx)
  }

  pub fn distribute_custom_destination_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, DistributeCustomDestinationV0<'info>>,
  ) -> Result<()> {
    distribute_custom_destination_v0::handler(ctx)
  }

  pub fn set_current_rewards_v1(
    ctx: Context<SetCurrentRewardsV1>,
    args: SetCurrentRewardsArgsV0,
  ) -> Result<()> {
    set_current_rewards_v1::handler(ctx, args)
  }

  pub fn dummy_ix(_ctx: Context<DummyIx>) -> Result<()> {
    Err(error!(crate::error::ErrorCode::DummyInstruction))
  }

  pub fn temp_update_matching_destination(
    ctx: Context<TempUpdateMatchingDestination>,
  ) -> Result<()> {
    temp_update_matching_destination::handler(ctx)
  }
}

#[derive(Accounts)]
pub struct DummyIx<'info> {
  #[account(mut)]
  pub dummy: Account<'info, RemoteTaskTransactionV0>,
  pub dummy_2: Account<'info, SetCurrentRewardsTransactionV0>,
}
