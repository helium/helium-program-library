use anchor_lang::prelude::*;

#[account]
#[derive(Default, InitSpace)]
pub struct EpochTrackerV0 {
  pub authority: Pubkey,
  pub dao: Pubkey,
  pub epoch: u64,
  pub bump_seed: u8,
}

#[account]
#[derive(Default, InitSpace)]
pub struct DelegationClaimBotV0 {
  pub delegated_position: Pubkey,
  pub task_queue: Pubkey,
  pub rent_refund: Pubkey,
  pub bump_seed: u8,
}
