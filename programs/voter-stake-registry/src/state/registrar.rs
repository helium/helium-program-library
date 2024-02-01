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
  pub reserved2: [u64; 7], // split because `Default` does not support [u8; 60]
  pub voting_mints: Vec<VotingMintConfigV0>,
}

// Instance of a voting rights distributor.
#[account]
#[derive(Default)]
pub struct RegistrarV1 {
  pub mint: Pubkey,
  pub authority: Pubkey,
  // Debug only: time offset, to allow tests to move forward in time.
  pub time_offset: i64,
  // Allows a program to wrap updates to the position (transfer or reset lockup)
  pub position_update_authority: Option<Pubkey>,
  // Storage for voting mints and their configuration.
  pub collection: Pubkey, // The t22 gruping
  // Vote weight factor for all funds in the account, no matter if locked or not.
  //
  // In 1/SCALED_FACTOR_BASE units.
  pub baseline_vote_weight_scaled_factor: u64,

  // Maximum extra vote weight factor for lockups.
  //
  // This is the extra votes gained for lockups lasting lockup_saturation_secs or
  // longer. Shorter lockups receive only a fraction of the maximum extra vote weight,
  // based on lockup_time divided by lockup_saturation_secs.
  //
  // In 1/SCALED_FACTOR_BASE units.
  pub max_extra_lockup_vote_weight_scaled_factor: u64,

  // Genesis vote power multipliers for lockups.
  //
  // This is a multiplier applied to voting power for lockups created before
  // genesis_extra_lockup_expiration
  pub genesis_vote_power_multiplier: u8,

  // Timestamp of when to stop applying the genesis_extra_lockup_vote_weight_scaled_factor
  pub genesis_vote_power_multiplier_expiration_ts: i64,

  // Number of seconds of lockup needed to reach the maximum lockup bonus.
  pub lockup_saturation_secs: u64,
  pub bump_seed: u8,
  pub collection_bump_seed: u8,
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
