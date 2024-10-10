use anchor_lang::prelude::*;
use nft_proxy::ProxyConfigV0;

use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateRegistrarArgsV0 {
  pub position_freeze_authorities: Option<Vec<Pubkey>>,
}

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

pub fn handler(ctx: Context<UpdateRegistrarV0>, args: UpdateRegistrarArgsV0) -> Result<()> {
  ctx.accounts.registrar.proxy_config = ctx
    .accounts
    .proxy_config
    .clone()
    .map(|k| k.key())
    .unwrap_or_default();

  if let Some(authorities) = args.position_freeze_authorities {
    ctx.accounts.registrar.position_freeze_authorities = authorities;
  }

  Ok(())
}
