use std::mem::size_of;

use crate::error::*;
use crate::state::*;
use crate::util::resolve_vote_weight;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};
use itertools::Itertools;

#[derive(Accounts)]
pub struct UpdateVoterWeightRecordV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub registrar: AccountLoader<'info, Registrar>,

  #[account(
    seeds = [b"position".as_ref(), mint.key().as_ref()],
    bump = position.bump_seed,
    has_one = registrar,
    has_one = mint
  )]
  pub position: Box<Account<'info, PositionV0>>,
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    token::mint = mint,
    constraint = position_token_account.amount > 0
  )]
  pub position_token_account: Box<Account<'info, TokenAccount>>,

  #[account(
    init_if_needed,
    payer = payer,
    space = 8 + size_of::<VoterWeightRecord>(),
    seeds = [registrar.key().as_ref(), b"voter-weight-record".as_ref(), position_token_account.owner.as_ref()],
    bump,
    constraint = voter_weight_record.realm == registrar.load()?.realm,
    constraint = voter_weight_record.governing_token_owner == position_token_account.owner,
    constraint = voter_weight_record.governing_token_mint == registrar.load()?.realm_governing_token_mint,
  )]
  pub voter_weight_record: Account<'info, VoterWeightRecord>,
  pub rent: Sysvar<'info, Rent>,
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
  voter_weight_action: VoterWeightAction,
) -> Result<()> {
  let registrar = &ctx.accounts.registrar;
  let governing_token_owner = &ctx.accounts.voter_weight_record.governing_token_owner;

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

  for (mint, position) in ctx.remaining_accounts.iter().tuples() {
    let nft_vote_weight = resolve_vote_weight(
      registrar.load()?,
      governing_token_owner,
      mint,
      position,
      &mut unique_nft_mints,
    )?;

    voter_weight = voter_weight.checked_add(nft_vote_weight as u64).unwrap();
  }

  let voter_weight_record = &mut ctx.accounts.voter_weight_record;

  voter_weight_record.voter_weight = voter_weight;

  // Record is only valid as of the current slot
  voter_weight_record.voter_weight_expiry = Some(Clock::get()?.slot);

  // Set the action to make it specific and prevent being used for voting
  voter_weight_record.weight_action = Some(voter_weight_action.into());
  voter_weight_record.weight_action_target = None;

  Ok(())
}
