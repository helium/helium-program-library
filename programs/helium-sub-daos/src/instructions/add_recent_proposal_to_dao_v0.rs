use anchor_lang::prelude::*;
use proposal::{ProposalState, ProposalV0};

use crate::state::DaoV0;

#[derive(Accounts)]
pub struct AddRecentProposalToDaoV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    constraint = proposal.namespace == dao.proposal_namespace,
    constraint = matches!(proposal.state, ProposalState::Voting { .. })
  )]
  pub proposal: Account<'info, ProposalV0>,
  #[account(mut)]
  pub dao: Box<Account<'info, DaoV0>>,
}

pub fn handler(ctx: Context<AddRecentProposalToDaoV0>) -> Result<()> {
  ctx.accounts.dao.add_recent_proposal(
    ctx.accounts.proposal.key(),
    ctx.accounts.proposal.created_at,
  );

  Ok(())
}
