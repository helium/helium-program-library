use crate::{current_epoch, error::ErrorCode, state::*, OrArithError, TESTING};
use anchor_lang::prelude::*;
use shared_utils::precise_number::{PreciseNumber, TWO_PREC};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct CalculateUtilityPartTwoArgsV0 {
  pub epoch: u64,
}

#[derive(Accounts)]
#[instruction(args: CalculateUtilityPartTwoArgsV0)]
pub struct CalculateUtilityPartTwoV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    has_one = dao
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(
    seeds = ["dao_epoch_info".as_bytes(), dao.key().as_ref(), &args.epoch.to_le_bytes()], // Break into 30m epochs
    bump,
  )]
  pub dao_epoch_info: Box<Account<'info, DaoEpochInfoV0>>,
  #[account(
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &args.epoch.to_le_bytes()], // Break into 30m epochs
    bump,
  )]
  pub sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  pub clock: Sysvar<'info, Clock>,
  pub rent: Sysvar<'info, Rent>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<CalculateUtilityPartTwoV0>,
  args: CalculateUtilityPartTwoArgsV0,
) -> Result<()> {
  let epoch = current_epoch(ctx.accounts.clock.unix_timestamp);

  if !TESTING && args.epoch >= epoch {
    return Err(error!(ErrorCode::EpochNotOver));
  }

  if !ctx.accounts.sub_dao_epoch_info.utility_score.is_some() {
    return Err(error!(ErrorCode::PartOneNotCalculated));
  }

  if ctx.accounts.sub_dao_epoch_info.calculation_finished {
    return Err(error!(ErrorCode::UtilityScoreAlreadyCalculated));
  }

  let epoch_info = &mut ctx.accounts.sub_dao_epoch_info;

  let one = PreciseNumber::one();

  let total_devices = PreciseNumber::new(epoch_info.total_devices.into()).or_arith_error()?;
  let devices_with_fee = total_devices
    .checked_mul(
      &PreciseNumber::new(u128::from(ctx.accounts.sub_dao.onboarding_dc_fee)).or_arith_error()?,
    )
    .or_arith_error()?
    .checked_div(&PreciseNumber::new(100000_u128).or_arith_error()?) // Need onboarding fee in dollars
    .or_arith_error()?;

  let a = if epoch_info.total_devices > 0 {
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

  let utility_score_prec = PreciseNumber::new(epoch_info.utility_score.unwrap())
    .unwrap()
    .checked_mul(&a)
    .or_arith_error()?;
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
  epoch_info.calculation_finished = true;

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
