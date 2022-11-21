use anchor_lang::prelude::*;

declare_id!("hdaojPkgSD8bciDc1w2Z4kXFFibCXngJiw2GRpEL7Wf");

pub mod circuit_breaker;
pub mod error;
pub mod instructions;
pub mod state;
pub mod utils;

pub use instructions::*;
pub use state::*;
pub use utils::*;

#[program]
pub mod helium_sub_daos {
  use super::*;

  pub fn initialize_dao_v0(ctx: Context<InitializeDaoV0>, args: InitializeDaoArgsV0) -> Result<()> {
    initialize_dao_v0::handler(ctx, args)
  }

  pub fn initialize_sub_dao_v0(
    ctx: Context<InitializeSubDaoV0>,
    args: InitializeSubDaoArgsV0,
  ) -> Result<()> {
    initialize_sub_dao_v0::handler(ctx, args)
  }

  pub fn track_added_device_v0(
    ctx: Context<TrackAddedDeviceV0>,
    args: TrackAddedDeviceArgsV0,
  ) -> Result<()> {
    track_added_device_v0::handler(ctx, args)
  }

  pub fn track_dc_burn_v0(ctx: Context<TrackDcBurnV0>, args: TrackDcBurnArgsV0) -> Result<()> {
    track_dc_burn_v0::handler(ctx, args)
  }

  pub fn calculate_utility_score_v0(
    ctx: Context<CalculateUtilityScoreV0>,
    args: CalculateUtilityScoreArgsV0,
  ) -> Result<()> {
    calculate_utility_score_v0::handler(ctx, args)
  }

  pub fn issue_rewards_v0(ctx: Context<IssueRewardsV0>, args: IssueRewardsArgsV0) -> Result<()> {
    issue_rewards_v0::handler(ctx, args)
  }

  pub fn claim_rewards_v0(ctx: Context<ClaimRewardsV0>, args: ClaimRewardsArgsV0) -> Result<()> {
    claim_rewards_v0::handler(ctx, args)
  }

  pub fn purge_position_v0(ctx: Context<PurgePositionV0>, args: PurgePositionArgsV0) -> Result<()> {
    purge_position_v0::handler(ctx, args)
  }
}
