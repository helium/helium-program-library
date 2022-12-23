use anchor_lang::prelude::*;
use borsh::{BorshDeserialize, BorshSchema, BorshSerialize};
use solana_program::program_pack::IsInitialized;

use spl_governance_tools::account::{get_account_data, AccountMaxSize};

use crate::{error::VsrError, id};

/// Vote record indicating the given NFT voted on the Proposal
/// The PDA of the record is ["nft-vote-record",proposal,nft_mint]
/// It guarantees uniques and ensures the same NFT can't vote twice
#[derive(Clone, Debug, PartialEq, BorshDeserialize, BorshSerialize, BorshSchema)]
pub struct NftVoteRecord {
  /// NftVoteRecord discriminator sha256("account:NftVoteRecord")[..8]
  /// Note: The discriminator is used explicitly because NftVoteRecords
  /// are created and consumed dynamically using remaining_accounts
  /// and Anchor doesn't really support this scenario without going through lots of hoops
  /// Once Anchor has better support for the scenario it shouldn't be necessary
  pub account_discriminator: [u8; 8],

  /// Proposal which was voted on
  pub proposal: Pubkey,

  /// The mint of the NFT which was used for the vote
  pub nft_mint: Pubkey,

  /// The voter who casted this vote
  /// It's a Realm member pubkey corresponding to TokenOwnerRecord.governing_token_owner
  pub governing_token_owner: Pubkey,
}

impl NftVoteRecord {
  /// sha256("account:NftVoteRecord")[..8]
  pub const ACCOUNT_DISCRIMINATOR: [u8; 8] = [137, 6, 55, 139, 251, 126, 254, 99];
}

impl AccountMaxSize for NftVoteRecord {
  fn get_max_size(&self) -> Option<usize> {
    Some(8 + std::mem::size_of::<NftVoteRecord>() + 32)
  }
}

impl IsInitialized for NftVoteRecord {
  fn is_initialized(&self) -> bool {
    self.account_discriminator == NftVoteRecord::ACCOUNT_DISCRIMINATOR
  }
}

/// Returns NftVoteRecord PDA seeds
pub fn get_nft_vote_record_seeds<'a>(proposal: &'a Pubkey, nft_mint: &'a Pubkey) -> [&'a [u8]; 3] {
  [b"nft-vote-record", proposal.as_ref(), nft_mint.as_ref()]
}

/// Returns NftVoteRecord PDA address
pub fn get_nft_vote_record_address(proposal: &Pubkey, nft_mint: &Pubkey) -> Pubkey {
  Pubkey::find_program_address(&get_nft_vote_record_seeds(proposal, nft_mint), &id()).0
}

/// Deserializes account and checks owner program
pub fn get_nft_vote_record_data(nft_vote_record_info: &AccountInfo) -> Result<NftVoteRecord> {
  Ok(get_account_data::<NftVoteRecord>(
    &id(),
    nft_vote_record_info,
  )?)
}

pub fn get_nft_vote_record_data_for_proposal_and_token_owner(
  nft_vote_record_info: &AccountInfo,
  proposal: &Pubkey,
  governing_token_owner: &Pubkey,
) -> Result<NftVoteRecord> {
  let nft_vote_record = get_nft_vote_record_data(nft_vote_record_info)?;

  require!(
    nft_vote_record.proposal == *proposal,
    VsrError::InvalidProposalForNftVoteRecord
  );

  require!(
    nft_vote_record.governing_token_owner == *governing_token_owner,
    VsrError::InvalidTokenOwnerForNftVoteRecord
  );

  Ok(nft_vote_record)
}
