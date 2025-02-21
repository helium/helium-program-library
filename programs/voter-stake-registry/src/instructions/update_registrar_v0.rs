use anchor_lang::prelude::*;
use modular_governance::nft_proxy::accounts::ProxyConfigV0;

use crate::state::*;

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
  pub proxy_config: Option<Account<'info, ProxyConfigV0>>,
}

pub fn handler(ctx: Context<UpdateRegistrarV0>) -> Result<()> {
  ctx.accounts.registrar.proxy_config = ctx
    .accounts
    .proxy_config
    .clone()
    .map(|k| k.key())
    .unwrap_or_default();
  Ok(())
}
