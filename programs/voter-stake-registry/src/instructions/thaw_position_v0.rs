use anchor_lang::prelude::*;

use crate::state::{PositionV0, Registrar};

#[derive(Accounts)]
pub struct ThawPositionV0<'info> {
  #[account(
    mut,
    constraint = registrar.position_freeze_authorities.contains(&authority.key())
  )]
  pub authority: Signer<'info>,
  pub registrar: Account<'info, Registrar>,
  #[account(mut, has_one = registrar)]
  pub position: Account<'info, PositionV0>,
}

pub fn handler(ctx: Context<ThawPositionV0>) -> Result<()> {
  ctx
    .accounts
    .position
    .thaw(&ctx.accounts.registrar, &ctx.accounts.authority.key())?;
  Ok(())
}
