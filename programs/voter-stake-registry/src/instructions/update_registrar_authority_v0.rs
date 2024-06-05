use crate::state::*;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateRegistrarAuthorityArgsV0 {
  pub authority: Pubkey,
}

#[derive(Accounts)]
pub struct UpdateRegistrarAuthorityV0<'info> {
  #[account(
    mut,
    has_one = realm_authority,
  )]
  pub registrar: Box<Account<'info, Registrar>>,
  /// CHECK: checked by constraint
  pub realm_authority: Signer<'info>,
}

pub fn handler(
  ctx: Context<UpdateRegistrarAuthorityV0>,
  args: UpdateRegistrarAuthorityArgsV0,
) -> Result<()> {
  ctx.accounts.registrar.realm_authority = args.authority;
  Ok(())
}
