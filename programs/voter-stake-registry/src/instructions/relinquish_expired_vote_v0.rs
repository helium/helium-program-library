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
    has_one = proposal,
  )]
  pub marker: Box<Account<'info, VoteMarkerV0>>,
  #[account(
    mut,
    constraint = position.mint == marker.mint
  )]
  pub position: Box<Account<'info, PositionV0>>,
  #[account(
    constraint = !matches!(proposal.state, ProposalState::Voting { .. })
  )]
  pub proposal: Box<Account<'info, ProposalV0>>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RelinquishExpiredVoteV0>) -> Result<()> {
  ctx.accounts.position.num_active_votes -= ctx.accounts.marker.choices.len() as u16;
  ctx.accounts.marker.relinquished = true;

  Ok(())
}
