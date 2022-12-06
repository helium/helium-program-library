use crate::{
  current_epoch, error::ErrorCode, state::*, update_subdao_vehnt, OrArithError, TESTING,
};
use anchor_lang::prelude::*;
use shared_utils::precise_number::{PreciseNumber, FOUR_PREC};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct CalculateUtilityPartOneArgsV0 {
  pub epoch: u64,
}

#[derive(Accounts)]
#[instruction(args: CalculateUtilityPartOneArgsV0)]
pub struct CalculateUtilityPartOneV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    has_one = dao
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
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
  ctx: Context<CalculateUtilityPartOneV0>,
  args: CalculateUtilityPartOneArgsV0,
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
  // V = max(1, veHNT_dnp).
  // D = max(1, sqrt(DCs burned in USD)). 1 DC = $0.00001.
  // A = max(1, fourth_root(Total active device count * device activation fee)).
  let epoch_info = &mut ctx.accounts.sub_dao_epoch_info;
  let sub_dao = &mut ctx.accounts.sub_dao;
  update_subdao_vehnt(sub_dao, ctx.accounts.clock.unix_timestamp);
  epoch_info.total_vehnt = sub_dao.vehnt_staked;

  let dc_burned = PreciseNumber::new(epoch_info.dc_burned.into())
    .or_arith_error()?
    .checked_div(&PreciseNumber::new(100000_u128).or_arith_error()?) // 10^5 to get to dollars.
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

  let vehnt_staked = PreciseNumber::new(epoch_info.total_vehnt.into())
    .or_arith_error()?
    .checked_div(&PreciseNumber::new(100000000_u128).or_arith_error()?) // vehnt has 8 decimals
    .or_arith_error()?;

  let v = std::cmp::max(one.clone(), vehnt_staked);

  let dv_prec = d.checked_mul(&v).or_arith_error()?;
  // Convert to u128 with 12 decimals of precision
  let dv = dv_prec
    .checked_mul(
      &PreciseNumber::new(1000000000000_u128).or_arith_error()?, // u128 with 12 decimal places
    )
    .or_arith_error()?
    .to_imprecise()
    .unwrap();

  // Store the first part of the utility score
  epoch_info.utility_score = Some(dv);

  Ok(())
}
