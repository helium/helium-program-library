use crate::error::ErrorCode;
use crate::state::*;
use crate::utils::calculate_current_price;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct SubmitPriceArgsV0 {
  pub oracle_index: u8,
  pub price: u64,
}

#[derive(Accounts)]
#[instruction(args: SubmitPriceArgsV0)]
pub struct SubmitPriceV0<'info> {
  #[account(mut)]
  pub price_oracle: Box<Account<'info, PriceOracleV0>>,

  pub oracle: Signer<'info>,
}

pub fn handler(ctx: Context<SubmitPriceV0>, args: SubmitPriceArgsV0) -> Result<()> {
  let oracle = ctx
    .accounts
    .price_oracle
    .oracles
    .get_mut(args.oracle_index as usize)
    .unwrap();
  require!(
    oracle.authority == ctx.accounts.oracle.key(),
    ErrorCode::UnauthorisedOracle
  );

  let curr_ts = Clock::get()?.unix_timestamp;
  oracle.last_submitted_timestamp = Some(curr_ts);
  oracle.last_submitted_price = Some(args.price);

  let curr_price_opt = calculate_current_price(&ctx.accounts.price_oracle.oracles, curr_ts);
  if let Some(curr_price) = curr_price_opt {
    ctx.accounts.price_oracle.current_price = Some(curr_price);
    ctx.accounts.price_oracle.last_calculated_timestamp = Some(curr_ts);
  }
  Ok(())
}
