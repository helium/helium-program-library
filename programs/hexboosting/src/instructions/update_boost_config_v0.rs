use anchor_lang::prelude::*;
use helium_sub_daos::SubDaoV0;

use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateBoostConfigArgsV0 {
  pub start_authority: Option<Pubkey>,
  pub rent_reclaim_authority: Option<Pubkey>,
  pub boost_price: Option<u64>,
  pub minimum_periods: Option<u16>,
  pub price_oracle: Option<Pubkey>,
  pub dc_mint: Option<Pubkey>,
}

#[derive(Accounts)]
#[instruction(args: UpdateBoostConfigArgsV0)]
pub struct UpdateBoostConfigV0<'info> {
  #[account(
    has_one = authority,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  pub authority: Signer<'info>,
  #[account(
    mut,
    has_one = sub_dao
  )]
  pub boost_config: Box<Account<'info, BoostConfigV0>>,
}

pub fn handler(ctx: Context<UpdateBoostConfigV0>, args: UpdateBoostConfigArgsV0) -> Result<()> {
  if let Some(start_authority) = args.start_authority {
    ctx.accounts.boost_config.start_authority = start_authority;
  }

  if let Some(rent_reclaim_authority) = args.rent_reclaim_authority {
    ctx.accounts.boost_config.rent_reclaim_authority = rent_reclaim_authority;
  }

  if let Some(boost_price) = args.boost_price {
    ctx.accounts.boost_config.boost_price = boost_price
  }

  if let Some(minimum_periods) = args.minimum_periods {
    ctx.accounts.boost_config.minimum_periods = minimum_periods
  }

  if let Some(price_oracle) = args.price_oracle {
    ctx.accounts.boost_config.price_oracle = price_oracle
  }

  if let Some(dc_mint) = args.dc_mint {
    ctx.accounts.boost_config.dc_mint = dc_mint;
  }

  Ok(())
}
