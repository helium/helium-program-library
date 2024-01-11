use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{burn, Burn, Mint, Token, TokenAccount},
};
use mobile_entity_manager::CarrierV0;
use price_oracle::{calculate_current_price, PriceOracleV0};
use shared_utils::resize_to_fit;

use crate::{BoostConfigV0, BoostedHexV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct BoostArgsV0 {
  pub location: u64,
  // Ensure that the start_ts they created this periods from is the
  // same as what's on chain. Otherwise a shift lift could make these offsets
  // invalid
  pub start_ts: i64,
  pub amounts: Vec<BoostAmountV0>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct BoostAmountV0 {
  pub period: u16,
  pub amount: u8,
}

fn get_space<'info>(boosted_hex: &AccountInfo<'info>) -> usize {
  if boosted_hex.data_len() == 0 {
    8 + 60 + std::mem::size_of::<BoostedHexV0>()
  } else {
    boosted_hex.data_len()
  }
}

#[derive(Accounts)]
#[instruction(args: BoostArgsV0)]
pub struct BoostV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    has_one = payment_mint,
    has_one = price_oracle,
    seeds = ["boost_config".as_bytes(), payment_mint.key().as_ref()],
    bump = boost_config.bump_seed,
  )]
  pub boost_config: Box<Account<'info, BoostConfigV0>>,
  #[account(
    has_one = hexboost_authority,
    constraint = carrier.sub_dao == boost_config.sub_dao,
    constraint = carrier.approved,
  )]
  pub carrier: Box<Account<'info, CarrierV0>>,
  pub hexboost_authority: Signer<'info>,
  pub price_oracle: Box<Account<'info, PriceOracleV0>>,
  #[account(mut)]
  pub payment_mint: Box<Account<'info, Mint>>,
  #[account(
    mut,
    associated_token::authority = payer,
    associated_token::mint = payment_mint,
  )]
  pub payment_account: Box<Account<'info, TokenAccount>>,
  #[account(
    init_if_needed,
    payer = payer,
    space = get_space(boosted_hex),
    seeds = [b"boosted_hex", boost_config.key().as_ref(), &args.location.to_le_bytes()],
    bump
  )]
  pub boosted_hex: Box<Account<'info, BoostedHexV0>>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(ctx: Context<BoostV0>, args: BoostArgsV0) -> Result<()> {
  // Ensure that the start_ts they created this periods from is the
  // same as what's on chain. Otherwise a shift lift could make these offsets
  // invalid
  require_eq!(args.start_ts, ctx.accounts.boosted_hex.start_ts);

  let mut is_initialized = ctx.accounts.boosted_hex.location != 0;
  ctx.accounts.boosted_hex.boost_config = ctx.accounts.boost_config.key();
  ctx.accounts.boosted_hex.location = args.location;
  ctx.accounts.boosted_hex.bump_seed = ctx.bumps["boosted_hex"];

  // Insert the new periods
  let max_period = args
    .amounts
    .iter()
    .map(|amount| amount.period)
    .max()
    .unwrap_or(0) as usize;
  if ctx.accounts.boosted_hex.boosts_by_period.len() <= max_period {
    ctx
      .accounts
      .boosted_hex
      .boosts_by_period
      .resize(max_period + 1, 0);
  }
  for amount in args.amounts.clone() {
    if ctx.accounts.boosted_hex.boosts_by_period[amount.period as usize] == u8::MAX {
      return Err(error!(ErrorCode::MaxBoostExceeded));
    }
    // Amounts must be > 1 or you could append 0's infinitely to the end of the boosts_by_period
    require_gt!(amount.amount, 0);
    ctx.accounts.boosted_hex.boosts_by_period[amount.period as usize] += amount.amount;
  }

  // Shift the periods left to discard past periods
  let now = Clock::get()?.unix_timestamp;
  if ctx.accounts.boosted_hex.start_ts != 0 {
    let elapsed_time = now - ctx.accounts.boosted_hex.start_ts;
    let elapsed_periods = elapsed_time
      .checked_div(ctx.accounts.boost_config.period_length as i64)
      .unwrap();
    if elapsed_periods > 0 {
      let shifts = elapsed_periods as usize;
      if shifts < ctx.accounts.boosted_hex.boosts_by_period.len() {
        ctx.accounts.boosted_hex.boosts_by_period.drain(0..shifts);
      } else {
        ctx.accounts.boosted_hex.boosts_by_period.clear();
        is_initialized = false;
      }
      ctx.accounts.boosted_hex.start_ts +=
        elapsed_periods * i64::from(ctx.accounts.boost_config.period_length);
    }
  }

  // Enforce minimum
  if !is_initialized {
    for i in 0..ctx.accounts.boost_config.minimum_periods {
      if let Some(amount) = args.amounts.get(i as usize) {
        require_eq!(amount.period, i, ErrorCode::BelowMinimumBoost);
        require_gt!(amount.amount, 0);
      } else {
        return Err(error!(ErrorCode::BelowMinimumBoost));
      }
    }
  }

  let total_fee: u64 = args
    .amounts
    .iter()
    .map(|amount| amount.amount as u64 * ctx.accounts.boost_config.boost_price)
    .sum();
  let price = calculate_current_price(
    &ctx.accounts.price_oracle.oracles,
    Clock::get()?.unix_timestamp,
  )
  .ok_or_else(|| error!(ErrorCode::NoOraclePrice))?;
  let dnt_fee = total_fee
    .checked_mul(1000000)
    .unwrap()
    .checked_div(price)
    .unwrap();

  burn(
    CpiContext::new(
      ctx.accounts.token_program.to_account_info(),
      Burn {
        mint: ctx.accounts.payment_mint.to_account_info(),
        from: ctx.accounts.payment_account.to_account_info(),
        authority: ctx.accounts.payer.to_account_info(),
      },
    ),
    dnt_fee,
  )?;

  resize_to_fit(
    &ctx.accounts.payer,
    &ctx.accounts.system_program,
    &ctx.accounts.boosted_hex,
  )?;

  Ok(())
}
