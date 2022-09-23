use anchor_lang::prelude::*;

declare_id!("daoK94GYdvRjVxkSyTxNLxtAEYZohLJqmwad8pBK261");

pub mod error;
pub mod instructions;
pub mod state;
pub mod utils;
pub mod uint;
pub mod precise_number;

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

  pub fn track_dc_burn_v0(
    ctx: Context<TrackDcBurnV0>,
    args: TrackDcBurnArgsV0,
  ) -> Result<()> {
    track_dc_burn_v0::handler(ctx, args)
  }

  pub fn calculate_utility_score_v0(
    ctx: Context<CalculateUtilityScoreV0>,
    args: CalculateUtilityScoreArgsV0,
  ) -> Result<()> {
    calculate_utility_score_v0::handler(ctx, args)
  }

  pub fn issue_rewards_v0(
    ctx: Context<IssueRewardsV0>,
    args: IssueRewardsArgsV0,
  ) -> Result<()> {
    issue_rewards_v0::handler(ctx, args)
  }
}
