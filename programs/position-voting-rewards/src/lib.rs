use anchor_lang::prelude::*;
#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

declare_id!("pvr1pJdeAcW6tzFyPRSmkL5Xwysi1Tq79f7KF2XB4zM");

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
  name: "Position Voting Rewards",
  project_url: "http://helium.com",
  contacts: "email:hello@helium.foundation",
  policy: "https://github.com/helium/helium-program-library/tree/master/SECURITY.md",


  // Optional Fields
  preferred_languages: "en",
  source_code: "https://github.com/helium/helium-program-library/tree/master/programs/position-voting-rewards",
  source_revision: default_env!("GITHUB_SHA", ""),
  source_release: default_env!("GITHUB_REF_NAME", ""),
  auditors: "Sec3"
}

pub mod create_account;
pub mod error;
pub mod instructions;
pub mod state;
pub mod util;

use instructions::*;

#[program]
pub mod position_voting_rewards {
  use super::*;

  pub fn initialize_vetoken_tracker_v0(ctx: Context<InitializeVeTokenTrackerV0>) -> Result<()> {
    initialize_vetoken_tracker_v0::handler(ctx)
  }

  pub fn enroll_v0(ctx: Context<EnrollV0>) -> Result<()> {
    enroll_v0::handler(ctx)
  }

  pub fn claim_rewards_v0(ctx: Context<ClaimRewardsV0>, args: ClaimRewardsArgsV0) -> Result<()> {
    claim_rewards_v0::handler(ctx, args)
  }

  pub fn reward_for_epoch_v0(
    ctx: Context<RewardForEpochV0>,
    args: RewardForEpochArgsV0,
  ) -> Result<()> {
    reward_for_epoch_v0::handler(ctx, args)
  }

  pub fn unenroll_v0(ctx: Context<UnenrollV0>) -> Result<()> {
    unenroll_v0::handler(ctx)
  }

  pub fn track_vote_v0(ctx: Context<TrackVoteV0>) -> Result<()> {
    track_vote_v0::handler(ctx)
  }
}
