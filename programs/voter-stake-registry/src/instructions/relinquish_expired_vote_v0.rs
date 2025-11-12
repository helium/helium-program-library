use anchor_lang::prelude::*;
use modular_governance::proposal::{accounts::ProposalV0, types::ProposalState};
use shared_utils::try_from;

use crate::state::*;

// Allow anyone to permissionlessly close expired votes and refund to user
#[derive(Accounts)]
pub struct RelinquishExpiredVoteV0<'info> {
  /// CHECK: Destination for refunded rent
  #[account(mut)]
  pub rent_refund: AccountInfo<'info>,
  /// CHECK: Account may or may not be initialized (could already have been closed)
  #[account(mut)]
  pub marker: UncheckedAccount<'info>,
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
  // Check if the marker account has data (is initialized)
  let marker_data = ctx.accounts.marker.try_borrow_data()?;

  if marker_data.is_empty() {
    // Account is not initialized, just return Ok without doing anything
    msg!("Marker account has already been closed, skipping");
    return Ok(());
  }
  drop(marker_data);

  // Attempt to deserialize the marker account
  let marker = try_from!(Account<VoteMarkerV0>, ctx.accounts.marker)?;

  // Verify the marker has the expected proposal and rent_refund
  require_eq!(marker.proposal, ctx.accounts.proposal.key());
  require_eq!(marker.rent_refund, ctx.accounts.rent_refund.key());

  marker.close(ctx.accounts.rent_refund.to_account_info())?;

  // Account is initialized, process the vote relinquishment
  let mut data = ctx.accounts.position.try_borrow_mut_data()?;
  if !data.is_empty() && !marker._deprecated_relinquished {
    let mut position = PositionV0::try_deserialize(&mut data.as_ref())?;
    require_eq!(position.mint, marker.mint);
    position.num_active_votes -= marker.choices.len() as u16;
    position.try_serialize(&mut *data)?;
  }

  Ok(())
}
