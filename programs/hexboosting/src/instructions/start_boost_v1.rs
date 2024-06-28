use anchor_lang::prelude::*;

use crate::{BoostConfigV0, BoostedHexV1, StartBoostArgsV0};

#[derive(Accounts)]
pub struct StartBoostV1<'info> {
  pub start_authority: Signer<'info>,
  #[account(
    has_one = start_authority
  )]
  pub boost_config: Box<Account<'info, BoostConfigV0>>,
  #[account(
    mut,
    has_one = boost_config,
  )]
  pub boosted_hex: Box<Account<'info, BoostedHexV1>>,
}

pub fn handler(ctx: Context<StartBoostV1>, args: StartBoostArgsV0) -> Result<()> {
  require_eq!(ctx.accounts.boosted_hex.start_ts, 0);
  require_gt!(args.start_ts, 0);

  ctx.accounts.boosted_hex.version += 1;
  ctx.accounts.boosted_hex.start_ts = args.start_ts;

  Ok(())
}
