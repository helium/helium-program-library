use crate::error::VsrError;
use crate::state::Registrar;
use crate::state::*;
use crate::util::get_vote_record_address;
use anchor_lang::prelude::*;
use itertools::Itertools;
use spl_governance::state::{enums::ProposalState, governance, proposal};
use spl_governance_tools::account::dispose_account;

/// Disposes NftVoteRecord and recovers the rent from the accounts   
/// It can only be executed when voting on the target Proposal ended or voter withdrew vote from the Proposal
///
/// Note: If a voter votes with NFT and transfers the token then in the current version of the program the new owner can't withdraw the vote
/// In order to support that scenario a change in spl-governance is needed
/// It would have to support revoke_vote instruction which would take as input VoteWeightRecord with the following values:
/// weight_action: RevokeVote, weight_action_target: VoteRecord, voter_weight: sum(previous owner NFT weight)
/// The instruction would decrease the previous voter total VoteRecord.voter_weight by the provided VoteWeightRecord.voter_weight
/// Once the spl-governance instruction is supported then nft-voter plugin should implement revoke_nft_vote instruction
/// to supply the required VoteWeightRecord and delete relevant NftVoteRecords
#[derive(Accounts)]
pub struct RelinquishVoteV0<'info> {
  pub registrar: Box<Account<'info, Registrar>>,

  #[account(
        mut,
        constraint = voter_weight_record.realm == registrar.realm,
        constraint = voter_weight_record.governing_token_mint == registrar.realm_governing_token_mint
    )]
  pub voter_weight_record: Account<'info, VoterWeightRecord>,

  /// CHECK: Owned by spl-governance instance specified in registrar.governance_program_id
  /// Governance account the Proposal is for
  #[account(owner = registrar.governance_program_id)]
  pub governance: UncheckedAccount<'info>,

  /// CHECK: Owned by spl-governance instance specified in registrar.governance_program_id
  #[account(owner = registrar.governance_program_id)]
  pub proposal: UncheckedAccount<'info>,

  /// TokenOwnerRecord of the voter who cast the original vote
  #[account(owner = registrar.governance_program_id)]
  /// CHECK: Owned by spl-governance instance specified in registrar.governance_program_id
  pub voter_token_owner_record: UncheckedAccount<'info>,

  /// Authority of the voter who cast the original vote
  /// It can be either governing_token_owner or its delegate and must sign this instruction
  pub voter_authority: Signer<'info>,

  /// CHECK: Owned by spl-governance instance specified in registrar.governance_program_id
  /// The account is used to validate that it doesn't exist and if it doesn't then Anchor owner check throws error
  /// The check is disabled here and performed inside the instruction
  /// #[account(owner = registrar.governance_program_id)]
  pub vote_record: UncheckedAccount<'info>,

  /// CHECK: The beneficiary who receives lamports from the disposed NftVoterRecord accounts can be any account
  #[account(mut)]
  pub beneficiary: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<RelinquishVoteV0>) -> Result<()> {
  let registrar = &ctx.accounts.registrar;
  let voter_weight_record = &mut ctx.accounts.voter_weight_record;

  let governing_token_owner = resolve_governing_token_owner(
    registrar,
    &ctx.accounts.voter_token_owner_record,
    &ctx.accounts.voter_authority,
    voter_weight_record,
  )?;

  // Ensure the Governance belongs to Registrar.realm and is owned by Registrar.governance_program_id
  let _governance = governance::get_governance_data_for_realm(
    &registrar.governance_program_id,
    &ctx.accounts.governance,
    &registrar.realm,
  )?;

  // Ensure the Proposal belongs to Governance from Registrar.realm and Registrar.governing_token_mint and is owned by Registrar.governance_program_id
  let proposal = proposal::get_proposal_data_for_governance_and_governing_mint(
    &registrar.governance_program_id,
    &ctx.accounts.proposal,
    &ctx.accounts.governance.key(),
    &registrar.realm_governing_token_mint,
  )?;

  // If the Proposal is still in Voting state then we can only Relinquish the NFT votes if the Vote was withdrawn in spl-gov first
  // When vote is withdrawn in spl-gov then VoteRecord is disposed and we have to assert it doesn't exist
  //
  // If the Proposal is in any other state then we can dispose NftVoteRecords without any additional Proposal checks
  if proposal.state == ProposalState::Voting {
    let vote_record_info = &ctx.accounts.vote_record.to_account_info();

    // Ensure the given VoteRecord address matches the expected PDA
    let vote_record_key = get_vote_record_address(
      &registrar.governance_program_id,
      &registrar.realm,
      &registrar.realm_governing_token_mint,
      &governing_token_owner,
      &ctx.accounts.proposal.key(),
    );

    require!(
      vote_record_key == vote_record_info.key(),
      VsrError::InvalidVoteRecordForNftVoteRecord
    );

    require!(
      // VoteRecord doesn't exist if data is empty or account_type is 0 when the account was disposed in the same Tx
      vote_record_info.data_is_empty() || vote_record_info.try_borrow_data().unwrap()[0] == 0,
      VsrError::VoteRecordMustBeWithdrawn
    );
  }

  // Prevent relinquishing NftVoteRecords within the VoterWeightRecord expiration period
  // It's needed when multiple stacked voter-weight plugins are used
  // Without the assertion the following vector of attack exists
  // 1) nft-voter.cast_nft_vote()
  // 2) voter-weight-plugin.cast_vote()
  // 3) nft-voter.relinquish_nft_vote()
  // 4) spl-gov.cast_vote() -> spl-gov uses VoterWeightRecord provided by voter-weight-plugin in step 2) while the nft vote is withdrawn and could be used to vote again
  if voter_weight_record.voter_weight_expiry >= Some(Clock::get()?.slot) {
    return err!(VsrError::VoterWeightRecordMustBeExpired);
  }

  // Dispose all NftVoteRecords
  for (nft_vote_record_info, position) in ctx.remaining_accounts.iter().tuples() {
    // Ensure NftVoteRecord is for the given Proposal and TokenOwner
    let nft_vote_record: Account<NftVoteRecord> = Account::try_from(nft_vote_record_info)?;
    require!(
      nft_vote_record.proposal == ctx.accounts.proposal.key(),
      VsrError::InvalidProposalForNftVoteRecord
    );
    require!(
      nft_vote_record.governing_token_owner == governing_token_owner,
      VsrError::InvalidTokenOwnerForNftVoteRecord
    );

    dispose_account(nft_vote_record_info, &ctx.accounts.beneficiary)?;

    let position_acc: &mut Account<PositionV0> = &mut Account::try_from(position)?;
    require!(
      position_acc.mint == nft_vote_record.nft_mint,
      VsrError::InvalidMintForPosition
    );

    position_acc.num_active_votes -= 1;
    position_acc.exit(&crate::ID)?;
    require!(position.is_writable, VsrError::PositionNotWritable);
  }

  // Reset VoterWeightRecord and set expiry to expired to prevent it from being used
  voter_weight_record.voter_weight = 0;
  voter_weight_record.voter_weight_expiry = Some(0);
  voter_weight_record.weight_action_target = None;

  Ok(())
}
