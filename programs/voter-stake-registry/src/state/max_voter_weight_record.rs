use crate::id;
use anchor_lang::prelude::Pubkey;
use anchor_lang::prelude::*;
use solana_program::pubkey::PUBKEY_BYTES;

/// MaxVoterWeightRecord account as defined in spl-governance-addin-api
/// It's redefined here without account_discriminator for Anchor to treat it as native account
///
/// The account is used as an api interface to provide max voting power to the governance program from external addin contracts
#[account]
#[derive(Debug, PartialEq)]
pub struct MaxVoterWeightRecord {
  /// The Realm the MaxVoterWeightRecord belongs to
  pub realm: Pubkey,

  /// Governing Token Mint the MaxVoterWeightRecord is associated with
  /// Note: The addin can take deposits of any tokens and is not restricted to the community or council tokens only
  // The mint here is to link the record to either community or council mint of the realm
  pub governing_token_mint: Pubkey,

  /// Max voter weight
  /// The max voter weight provided by the addin for the given realm and governing_token_mint
  pub max_voter_weight: u64,

  /// The slot when the max voting weight expires
  /// It should be set to None if the weight never expires
  /// If the max vote weight decays with time, for example for time locked based weights, then the expiry must be set
  /// As a pattern Revise instruction to update the max weight should be invoked before governance instruction within the same transaction
  /// and the expiry set to the current slot to provide up to date weight
  pub max_voter_weight_expiry: Option<u64>,

  /// Reserved space for future versions
  pub reserved: [u8; 8],
}

impl Default for MaxVoterWeightRecord {
  fn default() -> Self {
    Self {
      realm: Default::default(),
      governing_token_mint: Default::default(),
      max_voter_weight: Default::default(),
      max_voter_weight_expiry: Some(0),
      reserved: Default::default(),
    }
  }
}

impl MaxVoterWeightRecord {
  pub fn get_space() -> usize {
    8 + PUBKEY_BYTES * 2 + 8 + 1 + 8 + 8
  }
}

/// Returns MaxVoterWeightRecord PDA seeds
pub fn get_max_voter_weight_record_seeds<'a>(
  realm: &'a Pubkey,
  governing_token_mint: &'a Pubkey,
) -> [&'a [u8]; 3] {
  [
    b"max-voter-weight-record",
    realm.as_ref(),
    governing_token_mint.as_ref(),
  ]
}

/// Returns MaxVoterWeightRecord PDA address
pub fn get_max_voter_weight_record_address(
  realm: &Pubkey,
  governing_token_mint: &Pubkey,
) -> Pubkey {
  Pubkey::find_program_address(
    &get_max_voter_weight_record_seeds(realm, governing_token_mint),
    &id(),
  )
  .0
}
