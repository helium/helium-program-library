use anchor_lang::prelude::*;
use modular_governance::proposal::{accounts::ProposalV0, types::ProposalState};

use crate::state::*;

// Allow anyone to permissionlessly close expired votes and refund to user
#[derive(Accounts)]
pub struct RelinquishExpiredProxyVoteV0<'info> {
  /// CHECK: Destination for refunded rent
  #[account(mut)]
  pub rent_refund: AccountInfo<'info>,
  #[account(
    mut,
    has_one = proposal,
    has_one = rent_refund,
    close = rent_refund
  )]
  pub marker: Box<Account<'info, ProxyMarkerV0>>,
  #[account(
    constraint = !matches!(proposal.state, ProposalState::Voting { .. })
  )]
  pub proposal: Box<Account<'info, ProposalV0>>,
  pub system_program: Program<'info, System>,
}

pub fn handler(_: Context<RelinquishExpiredProxyVoteV0>) -> Result<()> {
  Ok(())
}
