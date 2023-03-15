use std::mem::size_of;

use crate::error::*;
use crate::state::*;
use crate::util::resolve_vote_weight;
use anchor_lang::prelude::*;
use itertools::Itertools;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateVoterWeightRecordArgsV0 {
  voter_weight_action: VoterWeightAction,
  owner: Pubkey,
}

impl Default for VoterWeightAction {
  fn default() -> Self {
    VoterWeightAction::CreateProposal
  }
}

#[derive(Accounts)]
#[instruction(args: UpdateVoterWeightRecordArgsV0)]
pub struct UpdateVoterWeightRecordV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub registrar: Box<Account<'info, Registrar>>,

  #[account(
    init_if_needed,
    payer = payer,
    space = 8 + size_of::<VoterWeightRecord>(),
    seeds = [registrar.key().as_ref(), b"voter-weight-record".as_ref(), args.owner.key().as_ref()],
    bump,
  )]
  pub voter_weight_record: Account<'info, VoterWeightRecord>,

  // TokenOwnerRecord of the voter who casts the vote
  #[account(
      owner = registrar.governance_program_id
    )]
  /// CHECK: Owned by spl-governance instance specified in registrar.governance_program_id
  pub voter_token_owner_record: UncheckedAccount<'info>,

  /// Authority of the voter
  /// It can be either governing_token_owner or its delegate and must sign this instruction
  pub voter_authority: Signer<'info>,

  pub system_program: Program<'info, System>,
}

/// Calculates the lockup-scaled, time-decayed voting power for the given
/// voter and writes it into a `VoteWeightRecord` account to be used by
/// the SPL governance program.
///
/// This "revise" instruction must be called immediately before voting, in
/// the same transaction.
pub fn handler(
  ctx: Context<UpdateVoterWeightRecordV0>,
  args: UpdateVoterWeightRecordArgsV0,
) -> Result<()> {
  let voter_weight_action = args.voter_weight_action;

  match voter_weight_action {
    // voter_weight for CastVote action can't be evaluated using this instruction
    VoterWeightAction::CastVote => return err!(VsrError::CastVoteIsNotAllowed),
    VoterWeightAction::CommentProposal
    | VoterWeightAction::CreateGovernance
    | VoterWeightAction::CreateProposal
    | VoterWeightAction::SignOffProposal => {}
  }

  let registrar = &ctx.accounts.registrar;
  let voter_weight_record = &mut ctx.accounts.voter_weight_record;

  voter_weight_record.governing_token_owner = args.owner;
  voter_weight_record.realm = registrar.realm;
  voter_weight_record.governing_token_mint = registrar.realm_governing_token_mint;

  let mut voter_weight = 0u64;

  // Ensure all nfts are unique
  let mut unique_nft_mints = vec![];

  let governing_token_owner = resolve_governing_token_owner(
    registrar,
    &ctx.accounts.voter_token_owner_record,
    &ctx.accounts.voter_authority,
    voter_weight_record,
  )?;

  require_eq!(governing_token_owner, args.owner, VsrError::InvalidOwner);

  for (token_account, position) in ctx.remaining_accounts.iter().tuples() {
    let nft_vote_weight = resolve_vote_weight(
      registrar,
      &args.owner,
      token_account,
      position,
      &mut unique_nft_mints,
    )?;

    voter_weight = voter_weight.checked_add(nft_vote_weight).unwrap();
  }

  voter_weight_record.voter_weight = voter_weight;

  // Record is only valid as of the current slot
  voter_weight_record.voter_weight_expiry = Some(Clock::get()?.slot);

  // Set the action to make it specific and prevent being used for voting
  voter_weight_record.weight_action = Some(voter_weight_action);
  voter_weight_record.weight_action_target = None;

  msg!("Set voter weight to {}", voter_weight);

  Ok(())
}
