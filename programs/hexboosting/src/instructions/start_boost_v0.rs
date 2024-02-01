use anchor_lang::prelude::*;
use mobile_entity_manager::CarrierV0;

use crate::{BoostConfigV0, BoostedHexV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct StartBoostArgsV0 {
  pub start_ts: i64,
}

#[derive(Accounts)]
pub struct StartBoostV0<'info> {
  pub start_authority: Signer<'info>,
  #[account(
    has_one = start_authority
  )]
  pub boost_config: Box<Account<'info, BoostConfigV0>>,
  #[account(
    mut,
    has_one = boost_config,
  )]
  pub boosted_hex: Box<Account<'info, BoostedHexV0>>,
}

pub fn handler(ctx: Context<StartBoostV0>, args: StartBoostArgsV0) -> Result<()> {
  ctx.accounts.boosted_hex.start_ts = args.start_ts;

  Ok(())
}
