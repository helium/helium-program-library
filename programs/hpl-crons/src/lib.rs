use anchor_lang::prelude::*;

mod error;
mod instructions;
mod state;

pub use instructions::*;
pub use state::*;

declare_id!("hcrLPFgFUY6sCUKzqLWxXx5bntDiDCrAZVcrXfx9AHu");

const EPOCH_LENGTH: u64 = 60 * 60 * 24;

pub fn current_epoch(unix_timestamp: i64) -> u64 {
  (unix_timestamp / (EPOCH_LENGTH as i64)).try_into().unwrap()
}

#[program]
pub mod hpl_crons {
  use super::*;

  pub const CIRCUIT_BREAKER_PROGRAM: Pubkey =
    pubkey!("circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g");

  pub fn init_epoch_tracker(ctx: Context<InitEpochTracker>) -> Result<()> {
    init_epoch_tracker::handler(ctx)
  }

  pub fn update_epoch_tracker(
    ctx: Context<UpdateEpochTracker>,
    args: UpdateEpochTrackerArgs,
  ) -> Result<()> {
    update_epoch_tracker::handler(ctx, args)
  }

  pub fn init_delegation_claim_bot_v0(ctx: Context<InitDelegationClaimBotV0>) -> Result<()> {
    init_delegation_claim_bot_v0::handler(ctx)
  }

  pub fn close_delegation_claim_bot_v0(ctx: Context<CloseDelegationClaimBotV0>) -> Result<()> {
    close_delegation_claim_bot_v0::handler(ctx)
  }

  pub fn queue_end_epoch(ctx: Context<QueueEndEpoch>) -> Result<tuktuk_program::RunTaskReturnV0> {
    queue_end_epoch::handler(ctx)
  }

  pub fn queue_delegation_claim_v0(
    ctx: Context<QueueDelegationClaimV0>,
  ) -> Result<tuktuk_program::RunTaskReturnV0> {
    queue_delegation_claim_v0::handler(ctx)
  }

  pub fn start_delegation_claim_bot_v0(
    ctx: Context<StartDelegationClaimBotV0>,
    args: StartDelegationClaimBotArgsV0,
  ) -> Result<()> {
    start_delegation_claim_bot_v0::handler(ctx, args)
  }

  pub fn init_entity_claim_cron_v0(
    ctx: Context<InitEntityClaimCronV0>,
    args: InitEntityClaimCronArgsV0,
  ) -> Result<()> {
    init_entity_claim_cron_v0::handler(ctx, args)
  }

  pub fn close_entity_claim_cron_v0(ctx: Context<CloseEntityClaimCronV0>) -> Result<()> {
    close_entity_claim_cron_v0::handler(ctx)
  }

  pub fn add_entity_to_cron_v0(
    ctx: Context<AddEntityToCronV0>,
    args: AddEntityToCronArgsV0,
  ) -> Result<()> {
    add_entity_to_cron_v0::handler(ctx, args)
  }

  pub fn remove_entity_from_cron_v0(
    ctx: Context<RemoveEntityFromCronV0>,
    args: RemoveEntityFromCronArgsV0,
  ) -> Result<()> {
    remove_entity_from_cron_v0::handler(ctx, args)
  }

  pub fn requeue_entity_claim_cron_v0(ctx: Context<RequeueEntityClaimCronV0>) -> Result<()> {
    requeue_entity_claim_cron_v0::handler(ctx)
  }

  pub fn queue_relinquish_expired_vote_marker_v0(
    ctx: Context<QueueRelinquishExpiredVoteMarkerV0>,
    args: QueueRelinquishExpiredVoteMarkerArgsV0,
  ) -> Result<()> {
    queue_relinquish_expired_vote_marker_v0::handler(ctx, args)
  }

  pub fn queue_resolve_proposal_v0(
    ctx: Context<QueueResolveProposalV0>,
    args: QueueResolveProposalArgsV0,
  ) -> Result<()> {
    queue_resolve_proposal_v0::handler(ctx, args)
  }

  pub fn queue_proxy_vote_v0(
    ctx: Context<QueueProxyVoteV0>,
    args: QueueProxyVoteArgsV0,
  ) -> Result<()> {
    queue_proxy_vote_v0::handler(ctx, args)
  }

  pub fn requeue_proxy_vote_v0(
    ctx: Context<RequeueProxyVoteV0>,
  ) -> Result<tuktuk_program::RunTaskReturnV0> {
    requeue_proxy_vote_v0::handler(ctx)
  }

  pub fn queue_relinquish_expired_proxy_vote_marker_v0(
    ctx: Context<QueueRelinquishExpiredProxyVoteMarkerV0>,
    args: QueueRelinquishExpiredProxyVoteMarkerArgsV0,
  ) -> Result<()> {
    queue_relinquish_expired_proxy_vote_marker_v0::handler(ctx, args)
  }

  pub fn queue_wallet_claim_v0(
    ctx: Context<QueueWalletClaimV0>,
    args: QueueWalletClaimArgsV0,
  ) -> Result<()> {
    queue_wallet_claim_v0::handler(ctx, args)
  }

  pub fn requeue_wallet_claim_v0(
    ctx: Context<RequeueWalletClaimV0>,
    args: RequeueWalletClaimArgsV0,
  ) -> Result<tuktuk_program::RunTaskReturnV0> {
    requeue_wallet_claim_v0::handler(ctx, args)
  }

  pub fn requeue_entity_claim_v0(
    ctx: Context<RequeueEntityClaimV0>,
  ) -> Result<tuktuk_program::RunTaskReturnV0> {
    requeue_entity_claim_v0::handler(ctx)
  }

  pub fn add_wallet_to_entity_cron_v0(
    ctx: Context<AddWalletToEntityCronV0>,
    args: AddWalletToEntityCronArgsV0,
  ) -> Result<()> {
    add_wallet_to_entity_cron_v0::handler(ctx, args)
  }

  pub fn requeue_relinquish_expired_vote_marker_v0(
    ctx: Context<RequeueRelinquishExpiredVoteMarkerV0>,
    args: RequeueRelinquishExpiredVoteMarkerArgsV0,
  ) -> Result<tuktuk_program::RunTaskReturnV0> {
    requeue_relinquish_expired_vote_marker_v0::handler(ctx, args)
  }

  pub fn start_delegation_claim_bot_v1(
    ctx: Context<StartDelegationClaimBotV1>,
    args: StartDelegationClaimBotArgsV0,
  ) -> Result<()> {
    start_delegation_claim_bot_v1::handler(ctx, args)
  }

  pub fn requeue_entity_claim_v1(
    ctx: Context<RequeueEntityClaimV1>,
  ) -> Result<tuktuk_program::RunTaskReturnV0> {
    requeue_entity_claim_v1::handler(ctx)
  }
}
