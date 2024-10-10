use anchor_lang::prelude::*;

use crate::{DevaddrConstraintV0, NetIdV0};

#[derive(Accounts)]
pub struct RemoveDevaddrConstraintV0<'info> {
  /// CHECK: Can be any sol wallet
  #[account(mut)]
  pub rent_refund: AccountInfo<'info>,
  pub authority: Signer<'info>,
  #[account(has_one = authority)]
  pub net_id: Box<Account<'info, NetIdV0>>,
  #[account(
    mut,
    close = rent_refund,
  )]
  pub devaddr_constraint: Account<'info, DevaddrConstraintV0>,
}

pub fn handler(_: Context<RemoveDevaddrConstraintV0>) -> Result<()> {
  Ok(())
}
