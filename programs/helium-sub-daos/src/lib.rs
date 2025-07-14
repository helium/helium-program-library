use anchor_lang::prelude::*;
#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

declare_id!("hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR");

pub mod create_account;
pub mod error;
pub mod instructions;
pub mod state;
pub mod utils;

pub use instructions::*;
pub use state::*;
pub use utils::*;

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
  name: "Helium Sub Daos",
  project_url: "http://helium.com",
  contacts: "email:hello@helium.foundation",
  policy: "https://github.com/helium/helium-program-library/tree/master/SECURITY.md",

  // Optional Fields
  preferred_languages: "en",
  source_code: "https://github.com/helium/helium-program-library/tree/master/programs/helium-sub-daos",
  source_revision: default_env!("GITHUB_SHA", ""),
  source_release: default_env!("GITHUB_REF_NAME", ""),
  auditors: "Sec3"
}

#[program]
pub mod helium_sub_daos {
  use super::*;

  // trigger build
  pub fn initialize_dao_v0(ctx: Context<InitializeDaoV0>, args: InitializeDaoArgsV0) -> Result<()> {
    initialize_dao_v0::handler(ctx, args)
  }

  pub fn initialize_sub_dao_v0(
    ctx: Context<InitializeSubDaoV0>,
    args: InitializeSubDaoArgsV0,
  ) -> Result<()> {
    initialize_sub_dao_v0::handler(ctx, args)
  }

  pub fn update_dao_v0(ctx: Context<UpdateDaoV0>, args: UpdateDaoArgsV0) -> Result<()> {
    update_dao_v0::handler(ctx, args)
  }

  pub fn update_sub_dao_v0(ctx: Context<UpdateSubDaoV0>, args: UpdateSubDaoArgsV0) -> Result<()> {
    update_sub_dao_v0::handler(ctx, args)
  }

  pub fn temp_update_sub_dao_epoch_info(
    ctx: Context<TempUpdateSubDaoEpochInfo>,
    args: TempUpdateSubDaoEpochInfoArgs,
  ) -> Result<()> {
    temp_update_sub_dao_epoch_info::handler(ctx, args)
  }

  pub fn update_sub_dao_vehnt_v0(
    ctx: Context<UpdateSubDaoVeHntV0>,
    args: UpdateSubDaoVeHntArgsV0,
  ) -> Result<()> {
    update_sub_dao_vehnt_v0::handler(ctx, args)
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

  pub fn delegate_v0(ctx: Context<DelegateV0>) -> Result<()> {
    delegate_v0::handler(ctx)
  }

  pub fn close_delegation_v0<'info>(
    ctx: Context<'_, '_, '_, 'info, CloseDelegationV0<'info>>,
  ) -> Result<()> {
    close_delegation_v0::handler(ctx)
  }

  pub fn claim_rewards_v0(ctx: Context<ClaimRewardsV0>, args: ClaimRewardsArgsV0) -> Result<()> {
    claim_rewards_v0::handler(ctx, args)
  }

  pub fn claim_rewards_v1(ctx: Context<ClaimRewardsV1>, args: ClaimRewardsArgsV0) -> Result<()> {
    claim_rewards_v1::handler(ctx, args)
  }

  pub fn transfer_v0(ctx: Context<TransferV0>, args: TransferArgsV0) -> Result<()> {
    transfer_v0::handler(ctx, args)
  }

  pub fn reset_lockup_v0(ctx: Context<ResetLockupV0>, args: ResetLockupArgsV0) -> Result<()> {
    reset_lockup_v0::handler(ctx, args)
  }

  pub fn track_dc_onboarding_fees_v0(
    ctx: Context<TrackDcOnboardingFeesV0>,
    args: TrackDcOnboardingFeesArgsV0,
  ) -> Result<()> {
    track_dc_onboarding_fees_v0::handler(ctx, args)
  }

  pub fn admin_set_dc_onboarding_fees_paid(
    ctx: Context<AdminSetDcOnboardingFeesPaid>,
    args: AdminSetDcOnboardingFeesPaidArgs,
  ) -> Result<()> {
    admin_set_dc_onboarding_fees_paid::handler(ctx, args)
  }

  pub fn admin_set_dc_onboarding_fees_paid_epoch_info(
    ctx: Context<AdminSetDcOnboardingFeesPaidEpochInfo>,
    args: AdminSetDcOnboardingFeesPaidEpochInfoArgs,
  ) -> Result<()> {
    admin_set_dc_onboarding_fees_paid_epoch_info::handler(ctx, args)
  }

  pub fn switch_mobile_ops_fund(ctx: Context<SwitchMobileOpsFund>) -> Result<()> {
    switch_mobile_ops_fund::handler(ctx)
  }

  pub fn initialize_hnt_delegator_pool(ctx: Context<InitializeHntDelegatorPool>) -> Result<()> {
    initialize_hnt_delegator_pool::handler(ctx)
  }

  pub fn extend_expiration_ts_v0(ctx: Context<ExtendExpirationTsV0>) -> Result<()> {
    extend_expiration_ts_v0::handler(ctx)
  }

  pub fn track_vote_v0(ctx: Context<TrackVoteV0>) -> Result<()> {
    track_vote_v0::handler(ctx)
  }

  pub fn temp_backfill_dao_recent_proposals(
    ctx: Context<TempBackfillDaoRecentProposals>,
  ) -> Result<()> {
    instructions::temp_backfill_dao_recent_proposals::handler(ctx)
  }

  pub fn add_recent_proposal_to_dao_v0(ctx: Context<AddRecentProposalToDaoV0>) -> Result<()> {
    add_recent_proposal_to_dao_v0::handler(ctx)
  }

  pub fn change_delegation_v0(ctx: Context<ChangeDelegationV0>) -> Result<()> {
    change_delegation_v0::handler(ctx)
  }

  pub fn temp_claim_buggy_rewards(
    ctx: Context<TempClaimBuggyRewards>,
    args: ClaimRewardsArgsV0,
  ) -> Result<()> {
    temp_claim_buggy_rewards::handler(ctx, args)
  }
}
