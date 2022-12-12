use anchor_lang::prelude::*;

declare_id!("vsrYuGJU88umvTsQbp8bVwa3vUeEKNnLRtxEYP65rBm");

pub mod error;
pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::*;

#[program]
pub mod voter_stake_registry {
  use super::*;

  // pub fn create_registrar_v0() -> Result<()> {}
  // pub fn configure_voting_mint_v0() -> Result<()> {}
  // pub fn create_voter_v0() -> Result<()> {}
  // pub fn create_deposit_entry_v0() -> Result<()> {}
  // pub fn deposit_v0() -> Result<()> {}
  // pub fn withdraw_v0() -> Result<()> {}
  // pub fn close_deposit_entry_v0() -> Result<()> {}
  // pub fn reset_lockup_v0() -> Result<()> {}
  // pub fn internal_transfer_locked_v0() -> Result<()> {}
  // pub fn internal_transfer_unlocked_v0() -> Result<()> {}
  // pub fn update_voter_weight_record_v0() -> Result<()> {}
  // pub fn update_max_vote_weight_v0() -> Result<()> {}
  // pub fn log_voter_info_v0() -> Result<()> {}
  // pub fn set_time_offset_v0() -> Result<()> {}
}