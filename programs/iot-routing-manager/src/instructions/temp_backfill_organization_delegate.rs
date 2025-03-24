use anchor_lang::prelude::*;
use std::str::FromStr;

use crate::{OrganizationDelegateV0, OrganizationV0};

#[derive(Accounts)]
pub struct TempBackfillOrganizationDelegate<'info> {
  #[account(
    mut,
    address = Pubkey::from_str("hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW").unwrap()
  )]
  pub payer: Signer<'info>,
  pub organization: Account<'info, OrganizationV0>,
  #[account(
    init,
    payer = payer,
    space = 8 + OrganizationDelegateV0::INIT_SPACE + 32,
    seeds = ["organization_delegate".as_bytes(), organization.key().as_ref(), delegate.key().as_ref()],
    bump,
  )]
  pub organization_delegate: Account<'info, OrganizationDelegateV0>,
  /// CHECK: The actual account that will act as a delegate
  pub delegate: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<TempBackfillOrganizationDelegate>) -> Result<()> {
  ctx
    .accounts
    .organization_delegate
    .set_inner(OrganizationDelegateV0 {
      organization: ctx.accounts.organization.key(),
      delegate: ctx.accounts.delegate.key(),
      bump_seed: ctx.bumps.organization_delegate,
    });
  Ok(())
}
