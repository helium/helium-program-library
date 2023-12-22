use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{burn, Burn, Mint, Token, TokenAccount},
};
use price_oracle::{calculate_current_price, PriceOracleV0};

use crate::{BoostConfigV0, BoostedHexV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct BoostArgsV0 {
  pub location: u64,
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
    has_one = price_oracle
  )]
  pub boost_config: Box<Account<'info, BoostConfigV0>>,
  pub price_oracle: Box<Account<'info, PriceOracleV0>>,
  #[account(mut)]
  pub payment_mint: Box<Account<'info, Mint>>,
  #[account(
    associated_token::authority = payer,
    associated_token::mint = payment_mint,
  )]
  pub payment_account: Box<Account<'info, TokenAccount>>,
  #[account(
    init_if_needed,
    payer = payer,
    space = get_space(boosted_hex),
    seeds = [b"boosted_hex", payment_mint.key().as_ref(), &args.location.to_le_bytes()],
    bump
  )]
  pub boosted_hex: Box<Account<'info, BoostedHexV0>>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(ctx: Context<BoostV0>, args: BoostArgsV0) -> Result<()> {
  let is_initialized = ctx.accounts.boosted_hex.location != 0;
  ctx.accounts.boosted_hex.boost_config = ctx.accounts.boost_config.key();
  ctx.accounts.boosted_hex.location = args.location;

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
  let dnt_fee = price
    .checked_mul(1000000)
    .unwrap()
    .checked_div(total_fee)
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

  for amount in args.amounts {
    if ctx.accounts.boosted_hex.boosts_by_period[amount.period as usize] == u8::MAX {
      return Err(error!(ErrorCode::MaxBoostExceeded));
    }
    ctx.accounts.boosted_hex.boosts_by_period[amount.period as usize] += amount.amount;
  }

  Ok(())
}
