use anchor_lang::prelude::*;
use clockwork_sdk::state::ThreadResponse;

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

  pub fn track_dc_burn_v0(ctx: Context<TrackDcBurnV0>, args: TrackDcBurnArgsV0) -> Result<()> {
    track_dc_burn_v0::handler(ctx, args)
  }

  pub fn calculate_utility_score_v0(
    ctx: Context<CalculateUtilityScoreV0>,
    args: CalculateUtilityScoreArgsV0,
  ) -> Result<ThreadResponse> {
    calculate_utility_score_v0::handler(ctx, args)
  }

  pub fn issue_rewards_v0(ctx: Context<IssueRewardsV0>, args: IssueRewardsArgsV0) -> Result<()> {
    issue_rewards_v0::handler(ctx, args)
  }

  pub fn stake_v0(ctx: Context<StakeV0>) -> Result<()> {
    stake_v0::handler(ctx)
  }

  pub fn close_stake_v0(ctx: Context<CloseStakeV0>) -> Result<()> {
    close_stake_v0::handler(ctx)
  }

  pub fn claim_rewards_v0(ctx: Context<ClaimRewardsV0>, args: ClaimRewardsArgsV0) -> Result<()> {
    claim_rewards_v0::handler(ctx, args)
  }

  pub fn purge_position_v0(ctx: Context<PurgePositionV0>) -> Result<()> {
    purge_position_v0::handler(ctx)
  }

  pub fn refresh_position_v0(ctx: Context<RefreshPositionV0>) -> Result<()> {
    refresh_position_v0::handler(ctx)
  }
}
