use anchor_lang::prelude::*;

use crate::{OrganizationDelegateV0, OrganizationV0};

#[derive(Accounts)]
pub struct InitializeOrganizationDelegateV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub authority: Signer<'info>,
  #[account(
    has_one = authority
  )]
  pub organization: Account<'info, OrganizationV0>,
  #[account(
    init,
    payer = payer,
    space = 8 + OrganizationDelegateV0::INIT_SPACE + 32,
    seeds = [b"organization_delegate", organization.key().as_ref(), delegate.key().as_ref()],
    bump,
  )]
  pub organization_delegate: Account<'info, OrganizationDelegateV0>,
  /// CHECK: The actual account that will act as a delegate
  pub delegate: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeOrganizationDelegateV0>) -> Result<()> {
  ctx
    .accounts
    .organization_delegate
    .set_inner(OrganizationDelegateV0 {
      organization: ctx.accounts.organization.key(),
      delegate: ctx.accounts.delegate.key(),
      bump_seed: ctx.bumps["organization_delegate"],
    });
  Ok(())
}