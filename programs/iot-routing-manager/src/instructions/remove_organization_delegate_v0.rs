use anchor_lang::prelude::*;

use crate::{OrganizationDelegateV0, OrganizationV0};

#[derive(Accounts)]
pub struct RemoveOrganizationDelegateV0<'info> {
  /// CHECK: Can be any sol wallet
  #[account(mut)]
  pub rent_refund: AccountInfo<'info>,
  pub authority: Signer<'info>,
  #[account(
    has_one = authority
  )]
  pub organization: Account<'info, OrganizationV0>,
  #[account(
    mut,
    close = rent_refund,
  )]
  pub organization_delegate: Account<'info, OrganizationDelegateV0>,
}

pub fn handler(_: Context<RemoveOrganizationDelegateV0>) -> Result<()> {
  Ok(())
}
