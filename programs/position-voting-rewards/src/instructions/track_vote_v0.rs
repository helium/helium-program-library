use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use proposal::ProposalV0;
use voter_stake_registry::{
  state::{PositionV0, Registrar, VoteMarkerV0},
  VoterStakeRegistry,
};

use crate::{
  error::ErrorCode,
  state::{EnrolledPositionV0, VeTokenTrackerV0},
};

#[derive(Accounts)]
pub struct TrackVoteV0<'info> {
  #[account(
    constraint = proposal.namespace == vetoken_tracker.proposal_namespace
  )]
  pub proposal: Account<'info, ProposalV0>,
  #[account(
    mut,
    has_one = mint,
    constraint = position.registrar == vetoken_tracker.registrar
  )]
  pub position: Box<Account<'info, PositionV0>>,
  pub mint: Box<Account<'info, Mint>>,
  /// CHECK: Checked by seeds
  #[account(
    seeds = [b"marker", mint.key().as_ref(), proposal.key().as_ref()],
    bump,
    seeds::program = vsr_program
  )]
  pub marker: UncheckedAccount<'info>,
  #[account(mut)]
  pub vetoken_tracker: Box<Account<'info, VeTokenTrackerV0>>,
  #[account(mut,
    has_one = vetoken_tracker,
    seeds = ["enrolled_position".as_bytes(), position.key().as_ref()],
    bump = enrolled_position.bump_seed,
  )]
  pub enrolled_position: Box<Account<'info, EnrolledPositionV0>>,
  /// TODO: Add vsr epoch info here and update the recent proposals
  pub vsr_program: Program<'info, VoterStakeRegistry>,
}

pub fn handler(ctx: Context<TrackVoteV0>) -> Result<()> {
  let data = ctx.accounts.marker.data.try_borrow().unwrap();
  let has_data = !data.is_empty();
  drop(data);
  let mut voted = has_data;
  if has_data {
    let marker: Account<VoteMarkerV0> = Account::try_from(&ctx.accounts.marker.to_account_info())?;
    require_eq!(
      marker.registrar,
      ctx.accounts.position.registrar,
      ErrorCode::InvalidMarker
    );
    voted = !marker.choices.is_empty();
  }
  if voted {
    ctx.accounts.enrolled_position.add_recent_proposal(
      ctx.accounts.proposal.key(),
      ctx.accounts.proposal.created_at,
    );
  } else {
    ctx
      .accounts
      .enrolled_position
      .remove_recent_proposal(ctx.accounts.proposal.key());
  }
  Ok(())
}
