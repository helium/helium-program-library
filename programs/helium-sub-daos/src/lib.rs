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
  ) -> Result<()> {
    calculate_utility_score_v0::handler(ctx, args)
  }

  pub fn issue_rewards_v0(
    ctx: Context<IssueRewardsV0>,
    args: IssueRewardsArgsV0,
  ) -> Result<ThreadResponse> {
    issue_rewards_v0::handler(ctx, args)
  }

  pub fn delegate_v0(ctx: Context<DelegateV0>) -> Result<()> {
    delegate_v0::handler(ctx)
  }

  pub fn close_delegation_v0(ctx: Context<CloseDelegationV0>) -> Result<()> {
    close_delegation_v0::handler(ctx)
  }

  pub fn claim_rewards_v0(ctx: Context<ClaimRewardsV0>, args: ClaimRewardsArgsV0) -> Result<()> {
    claim_rewards_v0::handler(ctx, args)
  }

  pub fn transfer_v0(ctx: Context<TransferV0>, args: TransferArgsV0) -> Result<()> {
    transfer_v0::handler(ctx, args)
  }

  pub fn issue_hst_pool_v0(ctx: Context<IssueHstPoolV0>, args: IssueHstPoolArgsV0) -> Result<()> {
    issue_hst_pool_v0::handler(ctx, args)
  }

  pub fn reset_lockup_v0(ctx: Context<ResetLockupV0>, args: ResetLockupArgsV0) -> Result<()> {
    reset_lockup_v0::handler(ctx, args)
  }

  pub fn sub_dao_kickoff_v0(ctx: Context<SubDaoKickoffV0>) -> Result<ThreadResponse> {
    sub_dao_kickoff_v0::handler(ctx)
  }

  pub fn dao_kickoff_v0(ctx: Context<DaoKickoffV0>) -> Result<ThreadResponse> {
    dao_kickoff_v0::handler(ctx)
  }

  pub fn reset_dao_thread_v0(ctx: Context<ResetDaoThreadV0>) -> Result<()> {
    reset_dao_thread_v0::handler(ctx)
  }

  pub fn reset_sub_dao_thread_v0(ctx: Context<ResetSubDaoThreadV0>) -> Result<()> {
    reset_sub_dao_thread_v0::handler(ctx)
  }
}
