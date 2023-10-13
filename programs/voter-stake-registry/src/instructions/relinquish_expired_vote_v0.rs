use anchor_lang::prelude::*;
use proposal::{ProposalState, ProposalV0};

use crate::state::*;

// Allow anyone to permissionlessly close expired votes and refund to user
#[derive(Accounts)]
pub struct RelinquishExpiredVoteV0<'info> {
  #[account(
    mut,
    seeds = [b"marker", marker.mint.as_ref(), proposal.key().as_ref()],
    bump = marker.bump_seed,
  )]
  pub marker: Box<Account<'info, VoteMarkerV0>>,
  #[account(mut)]
  pub position: Box<Account<'info, PositionV0>>,
  #[account(
    mut,
    constraint = match proposal.state {
      ProposalState::Voting { .. } => false,
      _ => true
    }
  )]
  pub proposal: Account<'info, ProposalV0>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RelinquishExpiredVoteV0>) -> Result<()> {
  ctx.accounts.position.num_active_votes -= 1;

  Ok(())
}
