use anchor_lang::prelude::*;
#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

pub mod error;
pub mod instructions;

pub use error::*;
pub use instructions::*;

declare_id!("rorcfdX4h9m9swCKgcypaHJ8NGYVANBpmV9EHn3cYrF");

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
  name: "Rewards Oracle",
  project_url: "http://helium.com",
  contacts: "email:hello@helium.foundation",
  policy: "https://github.com/helium/helium-program-library/tree/master/SECURITY.md",

  // Optional Fields
  preferred_languages: "en",
  source_code: "https://github.com/helium/helium-program-library/tree/master/programs/rewards-oracle",
  source_revision: default_env!("GITHUB_SHA", ""),
  source_release: default_env!("GITHUB_REF_NAME", ""),
  auditors: "Sec3"
}

#[program]
pub mod rewards_oracle {
  use super::*;

  pub fn set_current_rewards_wrapper_v0(
    ctx: Context<SetCurrentRewardsWrapperV0>,
    args: SetCurrentRewardsWrapperArgsV0,
  ) -> Result<()> {
    set_current_rewards_wrapper_v0::handler(ctx, args)
  }

  pub fn set_current_rewards_wrapper_v1(
    ctx: Context<SetCurrentRewardsWrapperV1>,
    args: SetCurrentRewardsWrapperArgsV1,
  ) -> Result<()> {
    set_current_rewards_wrapper_v1::handler(ctx, args)
  }

  pub fn set_current_rewards_wrapper_v2(
    ctx: Context<SetCurrentRewardsWrapperV2>,
    args: SetCurrentRewardsWrapperArgsV1,
  ) -> Result<()> {
    set_current_rewards_wrapper_v2::handler(ctx, args)
  }

  pub fn temp_close_recipient_wrapper_v0(
    ctx: Context<TempCloseRecipientWrapperV0>,
    args: TempCloseRecipientWrapperArgsV0,
  ) -> Result<()> {
    temp_close_recipient_wrapper_v0::handler(ctx, args)
  }
}
