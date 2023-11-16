use crate::error::*;
use crate::state::voting_mint_config::VotingMintConfigV0;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

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
  pub delegation_config: Pubkey,
  pub voting_mints: Vec<VotingMintConfigV0>,
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

  pub fn max_vote_weight(&self, mint_accounts: &[AccountInfo]) -> Result<u64> {
    self
      .voting_mints
      .iter()
      .try_fold(0u64, |mut sum, voting_mint_config| -> Result<u64> {
        if !voting_mint_config.in_use() {
          return Ok(sum);
        }
        let genesis_multiplier = if voting_mint_config.genesis_vote_power_multiplier > 0 {
          voting_mint_config.genesis_vote_power_multiplier
        } else {
          1
        };
        let mint_account = mint_accounts
          .iter()
          .find(|a| a.key() == voting_mint_config.mint)
          .ok_or_else(|| error!(VsrError::VotingMintNotFound))?;
        let mint = Account::<Mint>::try_from(mint_account)?;
        sum = sum
          .checked_add(voting_mint_config.baseline_vote_weight(mint.supply)?)
          .ok_or_else(|| error!(VsrError::VoterWeightOverflow))?;
        sum = sum
          .checked_add(voting_mint_config.max_extra_lockup_vote_weight(mint.supply)?)
          .ok_or_else(|| error!(VsrError::VoterWeightOverflow))?;
        sum = sum
          .checked_mul(genesis_multiplier as u64)
          .ok_or_else(|| error!(VsrError::VoterWeightOverflow))?;
        Ok(sum)
      })
  }
}

// Resolves governing_token_owner from voter TokenOwnerRecord and
// 1) asserts it matches the given Registrar and VoterWeightRecord
// 2) asserts governing_token_owner or its delegate is a signer
pub fn resolve_governing_token_owner(
  registrar: &Registrar,
  voter_token_owner_record_info: &AccountInfo,
  voter_authority_info: &AccountInfo,
  voter_weight_record: &VoterWeightRecord,
) -> Result<Pubkey> {
  let voter_token_owner_record =
    token_owner_record::get_token_owner_record_data_for_realm_and_governing_mint(
      &registrar.governance_program_id,
      voter_token_owner_record_info,
      &registrar.realm,
      &registrar.realm_governing_token_mint,
    )?;

  voter_token_owner_record.assert_token_owner_or_delegate_is_signer(voter_authority_info)?;

  require_eq!(
    voter_token_owner_record.governing_token_owner,
    voter_weight_record.governing_token_owner,
    VsrError::InvalidTokenOwnerForVoterWeightRecord
  );

  Ok(voter_token_owner_record.governing_token_owner)
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
use spl_governance::state::token_owner_record;

use super::VoterWeightRecord;
