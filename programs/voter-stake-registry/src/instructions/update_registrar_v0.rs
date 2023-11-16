use crate::state::*;
use anchor_lang::prelude::*;
use nft_delegation::DelegationConfigV0;

#[derive(Accounts)]
#[instruction()]
pub struct UpdateRegistrarV0<'info> {
  #[account(
    mut,
    has_one = realm_authority,
  )]
  pub registrar: Box<Account<'info, Registrar>>,
  /// CHECK: checked as signer
  pub realm_authority: Signer<'info>,
  pub delegation_config: Option<Account<'info, DelegationConfigV0>>,
}

pub fn handler(ctx: Context<UpdateRegistrarV0>) -> Result<()> {
  ctx.accounts.registrar.delegation_config = ctx
    .accounts
    .delegation_config
    .clone()
    .map(|k| k.key())
    .unwrap_or_default();
  Ok(())
}
