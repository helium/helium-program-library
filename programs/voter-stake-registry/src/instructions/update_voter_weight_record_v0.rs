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
  pub registrar: AccountLoader<'info, Registrar>,

  #[account(
    init_if_needed,
    payer = payer,
    space = 8 + size_of::<VoterWeightRecord>(),
    seeds = [registrar.key().as_ref(), b"voter-weight-record".as_ref(), args.owner.as_ref()],
    bump,
  )]
  pub voter_weight_record: Account<'info, VoterWeightRecord>,
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
  let registrar = &ctx.accounts.registrar;
  let governing_token_owner = args.owner;

  match voter_weight_action {
    // voter_weight for CastVote action can't be evaluated using this instruction
    VoterWeightAction::CastVote => return err!(VsrError::CastVoteIsNotAllowed),
    VoterWeightAction::CommentProposal
    | VoterWeightAction::CreateGovernance
    | VoterWeightAction::CreateProposal
    | VoterWeightAction::SignOffProposal => {}
  }

  let mut voter_weight = 0u64;

  // Ensure all nfts are unique
  let mut unique_nft_mints = vec![];

  for (token_account, position) in ctx.remaining_accounts.iter().tuples() {
    let nft_vote_weight = resolve_vote_weight(
      registrar.load()?,
      &governing_token_owner,
      token_account,
      position,
      &mut unique_nft_mints,
    )?;

    voter_weight = voter_weight.checked_add(nft_vote_weight).unwrap();
  }

  let voter_weight_record = &mut ctx.accounts.voter_weight_record;

  voter_weight_record.governing_token_owner = args.owner;
  voter_weight_record.realm = registrar.load()?.realm;
  voter_weight_record.voter_weight = voter_weight;
  voter_weight_record.governing_token_mint = registrar.load()?.realm_governing_token_mint;

  // Record is only valid as of the current slot
  voter_weight_record.voter_weight_expiry = Some(Clock::get()?.slot);

  // Set the action to make it specific and prevent being used for voting
  voter_weight_record.weight_action = Some(voter_weight_action);
  voter_weight_record.weight_action_target = None;

  msg!("Set voter weight to {}", voter_weight);

  Ok(())
}
