use crate::{current_epoch, error::ErrorCode, state::*, OrArithError, EPOCH_LENGTH};
use anchor_lang::prelude::*;
use shared_utils::precise_number::{PreciseNumber, FOUR_PREC, TWO_PREC};
use switchboard_v2::{AggregatorAccountData, AggregatorHistoryBuffer};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct CalculateUtilityScoreArgsV0 {
  pub epoch: u64,
}

pub const TESTING: bool = std::option_env!("TESTING").is_some();

#[derive(Accounts)]
#[instruction(args: CalculateUtilityScoreArgsV0)]
pub struct CalculateUtilityScoreV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    has_one = dao,
    has_one = active_device_aggregator
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(
    has_one = history_buffer
  )]
  pub active_device_aggregator: AccountLoader<'info, AggregatorAccountData>,
  /// CHECK: Checked by has_one with active device aggregator
  pub history_buffer: AccountInfo<'info>,
  #[account(
    init_if_needed,
    payer = payer,
    space = 60 + 8 + std::mem::size_of::<DaoEpochInfoV0>(),
    seeds = ["dao_epoch_info".as_bytes(), dao.key().as_ref(), &args.epoch.to_le_bytes()], // Break into 30m epochs
    bump,
  )]
  pub dao_epoch_info: Box<Account<'info, DaoEpochInfoV0>>,
  #[account(
    init_if_needed,
    payer = payer,
    space = 60 + 8 + std::mem::size_of::<SubDaoEpochInfoV0>(),
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &args.epoch.to_le_bytes()], // Break into 30m epochs
    bump,
  )]
  pub sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  pub clock: Sysvar<'info, Clock>,
  pub rent: Sysvar<'info, Rent>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<CalculateUtilityScoreV0>,
  args: CalculateUtilityScoreArgsV0,
) -> Result<()> {
  let epoch = current_epoch(ctx.accounts.clock.unix_timestamp);

  if !TESTING && args.epoch >= epoch {
    return Err(error!(ErrorCode::EpochNotOver));
  }

  if !TESTING && ctx.accounts.sub_dao_epoch_info.utility_score.is_some() {
    return Err(error!(ErrorCode::UtilityScoreAlreadyCalculated));
  }

  ctx.accounts.sub_dao_epoch_info.epoch = epoch;
  ctx.accounts.dao_epoch_info.epoch = epoch;
  ctx.accounts.dao_epoch_info.dao = ctx.accounts.dao.key();
  ctx.accounts.sub_dao_epoch_info.sub_dao = ctx.accounts.sub_dao.key();
  ctx.accounts.sub_dao_epoch_info.bump_seed = *ctx.bumps.get("sub_dao_epoch_info").unwrap();
  ctx.accounts.dao_epoch_info.bump_seed = *ctx.bumps.get("dao_epoch_info").unwrap();

  // Calculate utility score
  // utility score = V * D * A
  // V = max(1, veHNT_dnp). Not implemented yet
  // D = max(1, sqrt(DCs burned in USD)). 1 DC = $0.00001.
  // A = max(1, fourth_root(Total active device count * device activation fee)).
  let epoch_info = &mut ctx.accounts.sub_dao_epoch_info;
  let dc_burned = PreciseNumber::new(epoch_info.dc_burned.into())
    .or_arith_error()?
    .checked_div(&PreciseNumber::new(100000_u128).or_arith_error()?) // DC has 0 decimals, plus 10^5 to get to dollars.
    .or_arith_error()?;

  let history_buffer = AggregatorHistoryBuffer::new(&ctx.accounts.history_buffer)?;
  let timestamp = i64::try_from(args.epoch).unwrap() * EPOCH_LENGTH;
  let total_devices_u64 = u64::try_from(
    history_buffer
      .lower_bound(timestamp)
      .unwrap()
      .value
      .mantissa,
  )
  .unwrap();

  msg!(
    "Total devices: {}. Dc burned: {}.",
    total_devices_u64,
    epoch_info.dc_burned
  );

  let total_devices = PreciseNumber::new(total_devices_u64.into()).or_arith_error()?;
  let devices_with_fee = total_devices
    .checked_mul(
      &PreciseNumber::new(u128::from(ctx.accounts.sub_dao.onboarding_dc_fee)).or_arith_error()?,
    )
    .or_arith_error()?
    .checked_div(&PreciseNumber::new(100000_u128).or_arith_error()?) // Need onboarding fee in dollars
    .or_arith_error()?;

  // sqrt(x) = e^(ln(x)/2)
  // x^1/4 = e^(ln(x)/4))
  let one = PreciseNumber::one();
  let d = if epoch_info.dc_burned > 0 {
    std::cmp::max(
      one.clone(),
      dc_burned
        .log()
        .or_arith_error()?
        .checked_div(&FOUR_PREC.clone().signed())
        .or_arith_error()?
        .exp()
        .or_arith_error()?,
    )
  } else {
    one.clone()
  };

  let a = if total_devices_u64 > 0 {
    std::cmp::max(
      one,
      devices_with_fee
        .log()
        .or_arith_error()?
        .checked_div(&TWO_PREC.clone().signed())
        .or_arith_error()?
        .exp()
        .or_arith_error()?,
    )
  } else {
    one
  };

  let utility_score_prec = d.checked_mul(&a).or_arith_error()?;
  // Convert to u128 with 12 decimals of precision
  let utility_score = utility_score_prec
    .checked_mul(
      &PreciseNumber::new(1000000000000_u128).or_arith_error()?, // u128 with 12 decimal places
    )
    .or_arith_error()?
    .to_imprecise()
    .unwrap();

  // Store utility scores
  epoch_info.utility_score = Some(utility_score);

  // Only increment utility scores when either (a) in prod or (b) testing and we haven't already over-calculated utility scores.
  // TODO: We can remove this after breakpoint demo
  if !(TESTING
    && ctx.accounts.dao_epoch_info.num_utility_scores_calculated > ctx.accounts.dao.num_sub_daos)
  {
    ctx.accounts.dao_epoch_info.num_utility_scores_calculated += 1;
    ctx.accounts.dao_epoch_info.total_utility_score = ctx
      .accounts
      .dao_epoch_info
      .total_utility_score
      .checked_add(utility_score)
      .unwrap();
  }

  Ok(())
}
