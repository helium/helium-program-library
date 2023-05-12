use std::mem::size_of;

use crate::error::VsrError;
use crate::util::resolve_vote_weight;
use crate::{id, state::*};
use anchor_lang::prelude::*;
use anchor_lang::Accounts;
use itertools::Itertools;
use solana_program::program::{invoke, invoke_signed};
use solana_program::system_instruction::{self, create_account};
use spl_governance_tools::account::AccountMaxSize;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct CastVoteArgsV0 {
  proposal: Pubkey,
  owner: Pubkey,
}

/// Casts NFT vote. The NFTs used for voting are tracked using NftVoteRecord accounts
/// This instruction updates VoterWeightRecord which is valid for the current Slot and the target Proposal only
/// and hance the instruction has to be executed inside the same transaction as spl-gov.CastVote
///
/// CastNftVote is cumulative and can be invoked using several transactions if voter owns more than 5 NFTs to calculate total voter_weight
/// In this scenario only the last CastNftVote should be bundled  with spl-gov.CastVote in the same transaction
///
/// CastNftVote instruction and NftVoteRecord are not directional. They don't record vote choice (ex Yes/No)
/// VoteChoice is recorded by spl-gov in VoteRecord and this CastNftVote only tracks voting NFTs
///
#[derive(Accounts)]
#[instruction(args: CastVoteArgsV0)]
pub struct CastVoteV0<'info> {
  pub registrar: Box<Account<'info, Registrar>>,

  #[account(
    init_if_needed,
    payer = payer,
    space = 8 + size_of::<VoterWeightRecord>(),
    seeds = [registrar.key().as_ref(), b"voter-weight-record".as_ref(), args.owner.as_ref()],
    bump,
  )]
  pub voter_weight_record: Account<'info, VoterWeightRecord>,

  // TokenOwnerRecord of the voter who casts the vote
  #[account(
      owner = registrar.governance_program_id
    )]
  /// CHECK: Owned by spl-governance instance specified in registrar.governance_program_id
  pub voter_token_owner_record: UncheckedAccount<'info>,

  /// Authority of the voter who casts the vote
  /// It can be either governing_token_owner or its delegate and must sign this instruction
  pub voter_authority: Signer<'info>,

  /// The account which pays for the transaction
  #[account(mut)]
  pub payer: Signer<'info>,

  pub system_program: Program<'info, System>,
}

/// Casts vote with the NFT
pub fn handler<'info>(
  ctx: Context<'_, '_, '_, 'info, CastVoteV0<'info>>,
  args: CastVoteArgsV0,
) -> Result<()> {
  let registrar = &ctx.accounts.registrar;
  let voter_weight_record = &mut ctx.accounts.voter_weight_record;

  voter_weight_record.governing_token_owner = args.owner;
  voter_weight_record.realm = registrar.realm;
  voter_weight_record.governing_token_mint = registrar.realm_governing_token_mint;

  let mut voter_weight = 0_u64;

  // Ensure all voting nfts in the batch are unique
  let mut unique_nft_mints = vec![];

  let governing_token_owner = resolve_governing_token_owner(
    registrar,
    &ctx.accounts.voter_token_owner_record,
    &ctx.accounts.voter_authority,
    voter_weight_record,
  )?;

  require_eq!(governing_token_owner, args.owner, VsrError::InvalidOwner);

  for (token_account, position, nft_vote_record_info) in ctx.remaining_accounts.iter().tuples() {
    let nft_vote_weight = resolve_vote_weight(
      registrar,
      &args.owner,
      token_account,
      position,
      &mut unique_nft_mints,
    )?;

    voter_weight = voter_weight.checked_add(nft_vote_weight).unwrap();

    // Increase num active votes
    let position_acc: &mut Account<PositionV0> = &mut Account::try_from(position)?;
    position_acc.num_active_votes += 1;
    position_acc.exit(&crate::ID)?;
    require!(position.is_writable, VsrError::PositionNotWritable);

    // Create NFT vote record to ensure the same NFT hasn't been already used for voting
    // Note: The correct PDA of the NftVoteRecord is validated in create_and_serialize_account_signed
    // It ensures the NftVoteRecord is for ('nft-vote-record',proposal,nft_mint) seeds
    require!(
      nft_vote_record_info.data_is_empty(),
      VsrError::NftAlreadyVoted
    );

    // Note: proposal.governing_token_mint must match voter_weight_record.governing_token_mint
    // We don't verify it here because spl-gov does the check in cast_vote
    // and it would reject voter_weight_record if governing_token_mint doesn't match

    // Note: Once the NFT plugin is enabled the governing_token_mint is used only as identity
    // for the voting population and the tokens of that mint are no longer used
    let nft_mint = *unique_nft_mints.last().unwrap();
    let nft_vote_record = NftVoteRecord {
      proposal: args.proposal,
      nft_mint,
      governing_token_owner: args.owner,
    };

    let account_size = nft_vote_record.get_max_size().unwrap();
    let mut signers_seeds = get_nft_vote_record_seeds(&args.proposal, &nft_mint).to_vec();
    let (_, bump_seed) = Pubkey::find_program_address(&signers_seeds, &id());
    let bump = &[bump_seed];
    signers_seeds.push(bump);
    let rent = Rent::get()?;
    let total_lamports = rent.minimum_balance(account_size);
    let payer_info = ctx.accounts.payer.to_account_info();
    let system_info = ctx.accounts.system_program.to_account_info();
    let serialized_data = nft_vote_record.try_to_vec().unwrap();

    // If the account has some lamports already it can't be created using create_account instruction
    // Anybody can send lamports to a PDA and by doing so create the account and perform DoS attack by blocking create_account
    if nft_vote_record_info.lamports() > 0 {
      let top_up_lamports = total_lamports.saturating_sub(nft_vote_record_info.lamports());

      if top_up_lamports > 0 {
        invoke(
          &system_instruction::transfer(payer_info.key, nft_vote_record_info.key, top_up_lamports),
          &[
            payer_info.clone(),
            nft_vote_record_info.clone(),
            system_info.clone(),
          ],
        )?;
      }

      invoke_signed(
        &system_instruction::allocate(nft_vote_record_info.key, account_size as u64),
        &[nft_vote_record_info.clone(), system_info.clone()],
        &[&signers_seeds[..]],
      )?;

      invoke_signed(
        &system_instruction::assign(nft_vote_record_info.key, &id()),
        &[nft_vote_record_info.clone(), system_info.clone()],
        &[&signers_seeds[..]],
      )?;
    } else {
      // If the PDA doesn't exist use create_account to use lower compute budget
      let create_account_instruction = create_account(
        payer_info.key,
        nft_vote_record_info.key,
        total_lamports,
        account_size as u64,
        &id(),
      );

      invoke_signed(
        &create_account_instruction,
        &[
          payer_info.clone(),
          nft_vote_record_info.clone(),
          system_info.clone(),
        ],
        &[&signers_seeds[..]],
      )?;
    }

    nft_vote_record_info.data.borrow_mut()[0..8]
      .copy_from_slice(&NftVoteRecord::ACCOUNT_DISCRIMINATOR);
    nft_vote_record_info.data.borrow_mut()[8..(serialized_data.len() + 8)]
      .copy_from_slice(&serialized_data);
    nft_vote_record_info.exit(&id())?;
  }

  if voter_weight_record.weight_action_target == Some(args.proposal)
    && voter_weight_record.weight_action == Some(VoterWeightAction::CastVote)
  {
    // If cast_nft_vote is called for the same proposal then we keep accumulating the weight
    // this way cast_nft_vote can be called multiple times in different transactions to allow voting with any number of NFTs
    voter_weight_record.voter_weight = voter_weight_record
      .voter_weight
      .checked_add(voter_weight)
      .unwrap();
  } else {
    voter_weight_record.voter_weight = voter_weight;
  }

  // The record is only valid as of the current slot
  voter_weight_record.voter_weight_expiry = Some(Clock::get()?.slot);

  // The record is only valid for casting vote on the given Proposal
  voter_weight_record.weight_action = Some(VoterWeightAction::CastVote);
  voter_weight_record.weight_action_target = Some(args.proposal);

  Ok(())
}
