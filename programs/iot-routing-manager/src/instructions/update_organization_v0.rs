use anchor_lang::prelude::*;

use crate::OrganizationV0;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateOrganizationArgsV0 {
  new_authority: Option<Pubkey>,
  escrow_key: Option<String>,
}

#[derive(Accounts)]
pub struct UpdateOrganizationV0<'info> {
  pub authority: Signer<'info>,
  #[account(
    mut,
    has_one = authority
  )]
  pub organization: Account<'info, OrganizationV0>,
}

pub fn handler(ctx: Context<UpdateOrganizationV0>, args: UpdateOrganizationArgsV0) -> Result<()> {
  if let Some(authority) = args.new_authority {
    ctx.accounts.organization.authority = authority;
  }
  if let Some(escrow_key) = args.escrow_key {
    ctx.accounts.organization.escrow_key = escrow_key;
  }
  Ok(())
}
