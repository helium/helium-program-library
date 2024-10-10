use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use proposal::ProposalV0;
use voter_stake_registry::{
  state::{PositionV0, VoteMarkerV0},
  VoterStakeRegistry,
};

use crate::{
  error::ErrorCode,
  state::{EnrolledPositionV0, VeTokenTrackerV0},
};

#[derive(Accounts)]
pub struct TrackVoteV0<'info> {
  // Proves that the call is coming from vsrr
  pub registrar: Signer<'info>,
  pub proposal: Account<'info, ProposalV0>,
  #[account(
    mut,
    has_one = registrar,
    has_one = mint
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
  #[account(mut, has_one = registrar)]
  pub vetoken_tracker: Box<Account<'info, VeTokenTrackerV0>>,
  #[account(mut, has_one = vetoken_tracker)]
  pub enrolled_position: Box<Account<'info, EnrolledPositionV0>>,
  pub vsr_program: Program<'info, VoterStakeRegistry>,
}

pub fn handler(ctx: Context<TrackVoteV0>) -> Result<()> {
  let data = ctx.accounts.marker.data.try_borrow().unwrap();
  let has_data = !data.is_empty();
  let mut voted = has_data;
  if has_data {
    let marker = VoteMarkerV0::try_from_slice(&data)?;
    require_eq!(
      marker.registrar,
      ctx.accounts.registrar.key(),
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
