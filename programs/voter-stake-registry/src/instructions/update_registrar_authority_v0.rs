use crate::state::*;
use anchor_lang::prelude::*;
use spl_governance::state::realm;

#[derive(Accounts)]
#[instruction()]
pub struct UpdateRegistrarAuthorityV0<'info> {
  #[account(
    mut,
    seeds = [realm.key().as_ref(), b"registrar".as_ref(), registrar.realm_governing_token_mint.key().as_ref()],
    bump,
    has_one = realm,
    has_one = realm_authority,
  )]
  pub registrar: Box<Account<'info, Registrar>>,
  /// CHECK: checked by constraint
  pub realm_authority: Signer<'info>,
  /// CHECK: realm is owned by governance_program_id and is set on registrar
  pub realm: UncheckedAccount<'info>,
  /// CHECK: May be any instance of spl-governance
  pub governance_program_id: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<UpdateRegistrarAuthorityV0>) -> Result<()> {
  let realm = realm::get_realm_data(
    &ctx.accounts.governance_program_id.key(),
    &ctx.accounts.realm.to_account_info(),
  )?;

  ctx.accounts.registrar.realm_authority = realm.authority.unwrap();
  Ok(())
}
