use anchor_lang::prelude::*;
use proposal::ProposalV0;
use voter_stake_registry::{
  state::{PositionV0, VoteMarkerV0},
  VoterStakeRegistry,
};

use crate::state::{EnrolledPositionV0, VeTokenTrackerV0};

#[derive(Accounts)]
pub struct TrackVoteV0<'info> {
  // Proves that the call is coming from vsrr
  pub registrar: Signer<'info>,
  pub proposal: Account<'info, ProposalV0>,
  #[account(
    mut,
    has_one = registrar
  )]
  pub position: Box<Account<'info, PositionV0>>,
  /// CHECK: Checked by seeds
  #[account(
    seeds = [b"marker", position.mint.as_ref(), proposal.key().as_ref()],
    bump ,
    seeds::program = vsr_program
  )]
  pub marker: AccountInfo<'info>,
  #[account(mut, has_one = registrar)]
  pub ve_token_tracker: Account<'info, VeTokenTrackerV0>,
  pub enrolled_position: Account<'info, EnrolledPositionV0>,
  pub vsr_program: Program<'info, VoterStakeRegistry>,
}

pub fn handler(ctx: Context<TrackVoteV0>) -> Result<()> {
  let data = ctx.accounts.marker.data.try_borrow().unwrap();
  let has_data = !data.is_empty();
  let mut voted = has_data;
  if has_data {
    let marker = VoteMarkerV0::try_from_slice(&data)?;
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
