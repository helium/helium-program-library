use anchor_lang::prelude::*;
#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

pub mod instructions;

pub use instructions::*;

declare_id!("rorcfdX4h9m9swCKgcypaHJ8NGYVANBpmV9EHn3cYrF");

// Canonical bump for the static ["oracle_signer"] PDA under this program id,
// hardcoded to skip find_program_address grinding on every wrapper call.
pub const ORACLE_SIGNER_BUMP: u8 = 251;
pub const ORACLE_SIGNER_SEED: &[u8] = b"oracle_signer";
pub const ORACLE_SIGNER_SEEDS: &[&[u8]] = &[ORACLE_SIGNER_SEED, &[ORACLE_SIGNER_BUMP]];

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
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn oracle_signer_bump_is_canonical() {
    assert_eq!(
      Pubkey::find_program_address(&[ORACLE_SIGNER_SEED], &crate::ID).1,
      ORACLE_SIGNER_BUMP
    );
  }
}
