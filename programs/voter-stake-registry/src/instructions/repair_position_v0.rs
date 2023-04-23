use std::cmp::min;

use crate::error::*;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct RepairPositionV0<'info> {
  pub registrar: Box<Account<'info, Registrar>>,
  /// CHECK: Checked conditionally based on registrar
  #[account(
    constraint = registrar.position_update_authority.map(|k|
      k == *position_update_authority.key
    ).unwrap_or(true) @ VsrError::UnauthorizedPositionUpdateAuthority,
  )]
  pub position_update_authority: Signer<'info>,
  #[account(
    mut,
    has_one = registrar,
  )]
  pub position: Box<Account<'info, PositionV0>>,
}

pub fn handler(ctx: Context<RepairPositionV0>) -> Result<()> {
  let position = &mut ctx.accounts.position;
  position.lockup.end_ts = min(
    position.lockup.end_ts,
    position.lockup.start_ts + (4 * 365 * 60 * 60 * 24),
  );
  position.genesis_end = position.lockup.end_ts;

  Ok(())
}
