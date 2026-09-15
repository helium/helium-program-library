use anchor_lang::prelude::*;

#[account]
#[derive(Default, InitSpace)]
pub struct EpochTrackerV0 {
  pub authority: Pubkey,
  pub dao: Pubkey,
  pub epoch: u64,
  pub bump_seed: u8,
  /// The tuktuk task queue that drives this dao's end-epoch automation. Only a task run by
  /// this queue may run `queue_end_epoch`; `update_epoch_tracker` can still set `epoch`.
  pub task_queue: Pubkey,
}

#[account]
#[derive(Default, InitSpace)]
pub struct DelegationClaimBotV0 {
  pub delegated_position: Pubkey,
  pub task_queue: Pubkey,
  pub rent_refund: Pubkey,
  pub bump_seed: u8,
  pub last_claimed_epoch: u64,
  pub queued: bool,
  pub next_task: Pubkey,
}
