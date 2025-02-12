use anchor_lang::prelude::*;

mod error;
mod external_programs;
mod instructions;
mod state;

pub use external_programs::{
  helium_entity_manager, helium_sub_daos, no_emit, voter_stake_registry,
};
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
}
