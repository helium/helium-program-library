use anchor_lang::prelude::*;

use crate::OrganizationV0;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateOrganizationArgsV0 {
  authority: Option<Pubkey>,
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
  let organization = &mut ctx.accounts.organization;

  if args.authority.is_some() {
    organization.authority = args.authority.unwrap()
  }

  Ok(())
}
