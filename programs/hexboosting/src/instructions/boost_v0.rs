use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use data_credits::{
  cpi::{
    accounts::{BurnCommonV0, BurnWithoutTrackingV0},
    burn_without_tracking_v0,
  },
  program::DataCredits,
  BurnWithoutTrackingArgsV0, DataCreditsV0,
};
use mobile_entity_manager::CarrierV0;
use shared_utils::resize_to_fit;

use crate::{error::ErrorCode, BoostConfigV0, BoostedHexV1, DeviceTypeV0};

pub const TESTING: bool = std::option_env!("TESTING").is_some();

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct BoostArgsV0 {
  pub location: u64,
  // Ensure that the version they created this periods from is the
  // same as what's on chain. Otherwise a shift lift could make these offsets
  // invalid
  pub version: u32,
  pub amounts: Vec<BoostAmountV0>,
  pub device_type: DeviceTypeV0,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct BoostAmountV0 {
  pub period: u16,
  pub amount: u8,
}

fn get_space(boosted_hex: &AccountInfo) -> usize {
  if boosted_hex.data_len() == 0 {
    8 + 60 + std::mem::size_of::<BoostedHexV1>()
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
    has_one = dc_mint,
  )]
  pub boost_config: Box<Account<'info, BoostConfigV0>>,
  #[account(
    has_one = hexboost_authority,
    constraint = carrier.sub_dao == boost_config.sub_dao,
    constraint = carrier.approved,
  )]
  pub carrier: Box<Account<'info, CarrierV0>>,
  pub hexboost_authority: Signer<'info>,
  #[account(
    seeds=[
      "dc".as_bytes(),
      dc_mint.key().as_ref(),
    ],
    seeds::program = data_credits_program.key(),
    bump = data_credits.data_credits_bump,
    has_one = dc_mint
  )]
  pub data_credits: Box<Account<'info, DataCreditsV0>>,
  #[account(mut)]
  pub dc_mint: Box<Account<'info, Mint>>,
  #[account(
    mut,
    associated_token::authority = payer,
    associated_token::mint = dc_mint,
  )]
  pub payment_account: Box<Account<'info, TokenAccount>>,
  #[account(
    init_if_needed,
    payer = payer,
    space = get_space(boosted_hex),
    seeds = [b"boosted_hex", boost_config.key().as_ref(), &[(args.device_type as u8)], &args.location.to_le_bytes()],
    bump,
    constraint = boosted_hex.version == args.version @ ErrorCode::InvalidVersion,
  )]
  pub boosted_hex: Box<Account<'info, BoostedHexV1>>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub data_credits_program: Program<'info, DataCredits>,
}

pub fn handler(ctx: Context<BoostV0>, args: BoostArgsV0) -> Result<()> {
  require_gt!(args.location, 0);

  let mut is_initialized = ctx.accounts.boosted_hex.location != 0;
  ctx.accounts.boosted_hex.boost_config = ctx.accounts.boost_config.key();
  ctx.accounts.boosted_hex.location = args.location;
  ctx.accounts.boosted_hex.bump_seed = ctx.bumps.boosted_hex;
  ctx.accounts.boosted_hex.version += 1;
  ctx.accounts.boosted_hex.device_type = args.device_type;

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

  let now = Clock::get()?.unix_timestamp;

  for amount in args.amounts.clone() {
    if ctx.accounts.boosted_hex.boosts_by_period[amount.period as usize] == u8::MAX {
      return Err(error!(ErrorCode::MaxBoostExceeded));
    }

    if ctx.accounts.boosted_hex.start_ts > 0 {
      let period_start = ctx.accounts.boosted_hex.start_ts
        + i64::from(amount.period) * i64::from(ctx.accounts.boost_config.period_length);
      require_gt!(period_start, now, ErrorCode::BoostPeriodOver)
    }

    // Amounts must be > 0 or you could append 0's infinitely to the end of the boosts_by_period
    require_gt!(amount.amount, 0);
    if amount.period > 0 {
      require_gt!(
        ctx.accounts.boosted_hex.boosts_by_period[(amount.period - 1) as usize],
        0,
        ErrorCode::NoEmptyPeriods
      )
    }

    ctx.accounts.boosted_hex.boosts_by_period[amount.period as usize] += amount.amount;
  }

  // Shift the periods left to discard past periods
  if ctx.accounts.boosted_hex.start_ts != 0 {
    let elapsed_time = now - ctx.accounts.boosted_hex.start_ts;
    let elapsed_periods = elapsed_time
      .checked_div(ctx.accounts.boost_config.period_length as i64)
      .unwrap();
    if elapsed_periods > 0 {
      let shifts = elapsed_periods as usize;
      if shifts < ctx.accounts.boosted_hex.boosts_by_period.len() {
        ctx.accounts.boosted_hex.boosts_by_period.drain(0..shifts);
        ctx.accounts.boosted_hex.start_ts +=
          elapsed_periods * i64::from(ctx.accounts.boost_config.period_length);
      } else {
        ctx.accounts.boosted_hex.boosts_by_period.clear();
        is_initialized = false;
        ctx.accounts.boosted_hex.start_ts = 0
      }
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

  let dc_fee: u64 = args
    .amounts
    .iter()
    .map(|amount| amount.amount as u64 * ctx.accounts.boost_config.boost_price)
    .sum::<u64>();

  burn_without_tracking_v0(
    CpiContext::new(
      ctx.accounts.data_credits_program.to_account_info(),
      BurnWithoutTrackingV0 {
        burn_accounts: BurnCommonV0 {
          data_credits: ctx.accounts.data_credits.to_account_info(),
          owner: ctx.accounts.payer.to_account_info(),
          dc_mint: ctx.accounts.dc_mint.to_account_info(),
          burner: ctx.accounts.payment_account.to_account_info(),
          associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
          token_program: ctx.accounts.token_program.to_account_info(),
          system_program: ctx.accounts.system_program.to_account_info(),
        },
      },
    ),
    BurnWithoutTrackingArgsV0 { amount: dc_fee },
  )?;

  resize_to_fit(
    &ctx.accounts.payer,
    &ctx.accounts.system_program,
    &ctx.accounts.boosted_hex,
  )?;

  Ok(())
}
