use anchor_lang::prelude::*;

pub mod circuit_breaker;
pub mod errors;
pub mod instructions;
pub mod state;

pub use errors::*;
pub use instructions::*;
pub use state::*;

declare_id!("credMBJhYFzfn7NxBMdU4aUqFggAjgztaCcv2Fo6fPT");

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
}
