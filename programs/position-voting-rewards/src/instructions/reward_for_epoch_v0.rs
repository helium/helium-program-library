use anchor_lang::prelude::*;

use crate::state::VeTokenTrackerV0;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct RewardForEpochArgsV0 {
  pub amount: u64,
}

#[derive(Accounts)]
pub struct RewardForEpochV0<'info> {
  pub vetoken_tracker: Account<'info, VeTokenTrackerV0>,
}
