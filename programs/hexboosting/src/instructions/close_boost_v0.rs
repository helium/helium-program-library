use anchor_lang::prelude::*;

use crate::{BoostConfigV0, BoostedHexV0};

#[derive(Accounts)]
pub struct CloseBoostV0<'info> {
  pub rent_reclaim_authority: Signer<'info>,
  #[account(
    has_one = rent_reclaim_authority,
  )]
  pub boost_config: Box<Account<'info, BoostConfigV0>>,
  #[account(
    mut,
    close = rent_reclaim_authority,
    constraint = boosted_hex.is_expired(&boost_config),
    has_one = boost_config
  )]
  pub boosted_hex: Box<Account<'info, BoostedHexV0>>,
}

pub fn handler(_ctx: Context<CloseBoostV0>) -> Result<()> {
  Ok(())
}
