use anchor_lang::prelude::*;
use modular_governance::proposal::{accounts::ProposalV0, types::ProposalState};

use crate::state::*;

// Allow anyone to permissionlessly close expired votes and refund to user
#[derive(Accounts)]
pub struct RelinquishExpiredVoteV0<'info> {
  /// CHECK: Destination for refunded rent
  #[account(mut)]
  pub rent_refund: AccountInfo<'info>,
  #[account(
    mut,
    seeds = [b"marker", marker.mint.as_ref(), proposal.key().as_ref()],
    bump = marker.bump_seed,
    has_one = proposal,
    has_one = rent_refund,
    close = rent_refund
  )]
  pub marker: Box<Account<'info, VoteMarkerV0>>,
  #[account(mut)]
  /// CHECK: Deserialized later
  pub position: AccountInfo<'info>,
  #[account(
    constraint = !matches!(proposal.state, ProposalState::Voting { .. })
  )]
  pub proposal: Box<Account<'info, ProposalV0>>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RelinquishExpiredVoteV0>) -> Result<()> {
  let mut data = ctx.accounts.position.try_borrow_mut_data()?;
  if !data.is_empty() && !ctx.accounts.marker._deprecated_relinquished {
    let mut position = PositionV0::try_deserialize(&mut data.as_ref())?;
    require_eq!(position.mint, ctx.accounts.marker.mint);
    position.num_active_votes -= ctx.accounts.marker.choices.len() as u16;
    position.try_serialize(&mut *data)?;
  }

  Ok(())
}
