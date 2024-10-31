use anchor_lang::prelude::*;

use crate::{error::*, state::voting_mint_config::VotingMintConfigV0};

// Instance of a voting rights distributor.
#[account]
#[derive(Default)]
pub struct Registrar {
  pub governance_program_id: Pubkey,
  pub realm: Pubkey,
  pub realm_governing_token_mint: Pubkey,
  pub realm_authority: Pubkey,
  // Debug only: time offset, to allow tests to move forward in time.
  pub time_offset: i64,
  // Allows a program to wrap updates to the position (transfer or reset lockup)
  pub position_update_authority: Option<Pubkey>,
  // Storage for voting mints and their configuration.
  pub collection: Pubkey, // The metaplex collection to be issued for positions
  pub bump_seed: u8,
  pub collection_bump_seed: u8,

  // Empty bytes for future upgrades.
  pub reserved1: [u8; 4],
  pub reserved2: [u64; 3], // split because `Default` does not support [u8; 60]
  pub proxy_config: Pubkey,
  pub voting_mints: Vec<VotingMintConfigV0>,
  pub position_freeze_authorities: Vec<Pubkey>,
}

impl Registrar {
  pub fn clock_unix_timestamp(&self) -> i64 {
    Clock::get()
      .unwrap()
      .unix_timestamp
      .checked_add(self.time_offset)
      .unwrap()
  }

  pub fn voting_mint_config_index(&self, mint: Pubkey) -> Result<usize> {
    self
      .voting_mints
      .iter()
      .position(|r| r.mint == mint)
      .ok_or_else(|| error!(VsrError::VotingMintNotFound))
  }
}

#[macro_export]
macro_rules! registrar_seeds {
  ($registrar:expr) => {
    &[
      $registrar.realm.as_ref(),
      b"registrar".as_ref(),
      $registrar.realm_governing_token_mint.as_ref(),
      &[$registrar.bump_seed],
    ]
  };
}

pub use registrar_seeds;
