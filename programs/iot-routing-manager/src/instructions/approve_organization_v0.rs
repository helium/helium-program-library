use anchor_lang::prelude::*;

use crate::{NetIdV0, OrganizationV0};

#[derive(Accounts)]
pub struct ApproveOrganizationV0<'info> {
  pub authority: Signer<'info>,
  #[account(
    has_one = authority
  )]
  pub net_id: Account<'info, NetIdV0>,
  #[account(
    mut,
    has_one = net_id,
  )]
  pub organization: Account<'info, OrganizationV0>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ApproveOrganizationV0>) -> Result<()> {
  ctx.accounts.organization.approved = true;
  Ok(())
}
