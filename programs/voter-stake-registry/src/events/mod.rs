use anchor_lang::prelude::*;

#[event]
#[derive(Debug)]
pub struct VoterInfo {
  /// Voter's total voting power
  pub voting_power: u64,
  /// Voter's total voting power, when locked up
  pub voting_power_locked: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug)]
pub struct LockingInfo {
  /// Amount of locked tokens
  pub amount: u64,
  /// Time at which the lockup fully ends (None for Constant lockup)
  pub end_timestamp: Option<u64>,
}

#[event]
#[derive(Debug)]
pub struct DepositEntryInfo {
  pub deposit_entry_index: u8,
  pub voting_mint_config_index: u8,
  /// Amount that is unlocked
  pub unlocked: u64,
  /// Voting power implied by this deposit entry
  pub voting_power: u64,
  /// Voting power when locked up for minimum
  pub voting_power_locked: u64,
  /// Information about locking, if any
  pub locking: Option<LockingInfo>,
}
