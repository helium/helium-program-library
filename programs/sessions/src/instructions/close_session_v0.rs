use anchor_lang::prelude::*;

use crate::state::SessionV0;

#[derive(Accounts)]
pub struct CloseSessionV0<'info> {
  #[account(
    mut,
    close = rent_refund,
    constraint = Clock::get()?.unix_timestamp >= session.expiration_ts as i64,
    has_one = rent_refund
  )]
  pub session: Account<'info, SessionV0>,
  /// CHECK: Just receives rent refund
  #[account(mut)]
  pub rent_refund: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(_ctx: Context<CloseSessionV0>) -> Result<()> {
  Ok(())
}
