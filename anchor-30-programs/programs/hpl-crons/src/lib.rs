use anchor_lang::prelude::*;

declare_id!("hcrLPFgFUY6sCUKzqLWxXx5bntDiDCrAZVcrXfx9AHu");

mod instructions;
mod state;

pub use instructions::*;
pub use state::*;

mod no_emit {
  use anchor_lang::{declare_id, declare_program};

  declare_id!("noEmmgLmQdk6DLiPV8CSwQv3qQDyGEhz9m5A4zhtByv");

  declare_program!(no_emit);
}

mod helium_sub_daos {
  use anchor_lang::{declare_id, declare_program};

  declare_id!("hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR");

  declare_program!(helium_sub_daos);
}

mod voter_stake_registry {
  use anchor_lang::{declare_id, declare_program};

  declare_id!("hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8");

  declare_program!(voter_stake_registry);
}

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
}
