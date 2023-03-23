use crate::error::ErrorCode;
use crate::state::*;
use crate::utils::calculate_current_price;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdatePriceV0<'info> {
  #[account(mut)]
  pub price_oracle: Box<Account<'info, PriceOracleV0>>,
}

pub fn handler(ctx: Context<UpdatePriceV0>) -> Result<()> {
  let curr_ts = Clock::get()?.unix_timestamp;
  let curr_price_opt = calculate_current_price(&ctx.accounts.price_oracle.oracles, curr_ts);
  if let Some(curr_price) = curr_price_opt {
    ctx.accounts.price_oracle.current_price = Some(curr_price);
    ctx.accounts.price_oracle.last_calculated_timestamp = Some(curr_ts);
    Ok(())
  } else {
    Err(error!(ErrorCode::InvalidPriceUpdate))
  }
}
