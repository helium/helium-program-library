use anchor_lang::prelude::*;
use modular_governance::proposal::accounts::ProposalV0;

use crate::{state::*, VoteArgsV0};

#[derive(Accounts)]
pub struct ProxiedRelinquishVoteV1<'info> {
  #[account(
    mut,
    seeds = [b"proxy_marker", voter.key().as_ref(), proposal.key().as_ref()],
    bump = marker.bump_seed,
  )]
  pub marker: Box<Account<'info, ProxyMarkerV0>>,
  pub voter: Signer<'info>,
  #[account(mut)]
  pub proposal: Account<'info, ProposalV0>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ProxiedRelinquishVoteV1>, args: VoteArgsV0) -> Result<()> {
  ctx.accounts.marker.choices = ctx
    .accounts
    .marker
    .choices
    .clone()
    .into_iter()
    .filter(|c| *c != args.choice)
    .collect::<Vec<_>>();
  Ok(())
}
