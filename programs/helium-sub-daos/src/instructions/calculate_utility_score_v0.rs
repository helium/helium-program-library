use crate::{
  current_epoch, error::ErrorCode, state::*, update_subdao_vehnt, EPOCH_LENGTH,
};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};
use circuit_breaker::CircuitBreaker;
use shared_utils::precise_number::{PreciseNumber, FOUR_PREC, TWO_PREC};
use switchboard_v2::{AggregatorAccountData, AggregatorHistoryBuffer};
use voter_stake_registry::state::Registrar;

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
  pub registrar: Box<Account<'info, Registrar>>,
  #[account(
    has_one = registrar,
    has_one = hnt_mint
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  pub hnt_mint: Box<Account<'info, Mint>>,
  #[account(
    mut,
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
    seeds = ["dao_epoch_info".as_bytes(), dao.key().as_ref(), &(args.epoch - 1).to_le_bytes()],
    bump,
  )]
  /// CHECK: May not have ever been initialized
  pub prev_dao_epoch_info: UncheckedAccount<'info>,
  #[account(
    init_if_needed,
    payer = payer,
    space = 60 + 8 + std::mem::size_of::<DaoEpochInfoV0>(),
    seeds = ["dao_epoch_info".as_bytes(), dao.key().as_ref(), &args.epoch.to_le_bytes()],
    bump,
  )]
  pub dao_epoch_info: Box<Account<'info, DaoEpochInfoV0>>,
  #[account(
    init_if_needed,
    payer = payer,
    space = SubDaoEpochInfoV0::SIZE,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &args.epoch.to_le_bytes()],
    bump,
  )]
  pub sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
}

pub fn handler(
  ctx: Context<CalculateUtilityScoreV0>,
  args: CalculateUtilityScoreArgsV0,
) -> Result<()> {
  let end_of_epoch_ts = i64::try_from(args.epoch + 1).unwrap() * EPOCH_LENGTH;
  let curr_epoch = current_epoch(Clock::get()?.unix_timestamp);

  // Set total rewards, accounting for net emmissions by counting
  // burned hnt since last supply setting.
  let curr_supply = ctx.accounts.hnt_mint.supply;
  let mut prev_supply = curr_supply;
  if ctx.accounts.prev_dao_epoch_info.lamports() > 0 {
    let info: Account<DaoEpochInfoV0> = Account::try_from(&ctx.accounts.prev_dao_epoch_info)?;
    prev_supply = info.current_hnt_supply;
  }

  ctx.accounts.dao_epoch_info.total_rewards = ctx
    .accounts
    .dao
    .emission_schedule
    .get_emissions_at(end_of_epoch_ts)
    .unwrap()
    .checked_add(std::cmp::min(
      prev_supply.saturating_sub(curr_supply),
      ctx.accounts.dao.net_emissions_cap,
    ))
    .unwrap();
  ctx.accounts.dao_epoch_info.epoch = args.epoch;

  ctx.accounts.dao_epoch_info.current_hnt_supply = curr_supply
    .checked_add(ctx.accounts.dao_epoch_info.total_rewards)
    .unwrap();

  if !TESTING && args.epoch >= curr_epoch {
    return Err(error!(ErrorCode::EpochNotOver));
  }

  if !TESTING && ctx.accounts.sub_dao_epoch_info.utility_score.is_some() {
    return Err(error!(ErrorCode::UtilityScoreAlreadyCalculated));
  }

  if end_of_epoch_ts < ctx.accounts.dao.emission_schedule[0].start_unix_time {
    return Err(error!(ErrorCode::EpochToEarly));
  }

  ctx.accounts.sub_dao_epoch_info.epoch = args.epoch;
  let epoch_end_ts = ctx.accounts.sub_dao_epoch_info.end_ts();
  update_subdao_vehnt(
    &mut ctx.accounts.sub_dao,
    &mut ctx.accounts.sub_dao_epoch_info,
    epoch_end_ts,
  )?;

  ctx.accounts.dao_epoch_info.dao = ctx.accounts.dao.key();
  ctx.accounts.sub_dao_epoch_info.sub_dao = ctx.accounts.sub_dao.key();
  ctx.accounts.sub_dao_epoch_info.bump_seed = *ctx.bumps.get("sub_dao_epoch_info").unwrap();
  ctx.accounts.sub_dao_epoch_info.initialized = true;
  ctx.accounts.dao_epoch_info.bump_seed = *ctx.bumps.get("dao_epoch_info").unwrap();

  // Calculate utility score
  // utility score = V * D * A
  // V = max(1, veHNT_dnp).
  // D = max(1, sqrt(DCs burned in USD)). 1 DC = $0.00001.
  // A = max(1, fourth_root(Total active device count * device activation fee)).
  let epoch_info = &mut ctx.accounts.sub_dao_epoch_info;

  let dc_burned = PreciseNumber::new(epoch_info.dc_burned.into())
    .unwrap()
    .checked_div(&PreciseNumber::new(100000_u128).unwrap()) // DC has 0 decimals, plus 10^5 to get to dollars.
    .unwrap();

  let history_buffer = AggregatorHistoryBuffer::new(&ctx.accounts.history_buffer)?;

  let total_devices_opt = history_buffer.lower_bound(epoch_end_ts);

  let total_devices_u64: u64;
  if let Some(total_devices_row) = total_devices_opt {
    total_devices_u64 = total_devices_row.value.try_into().unwrap();
  } else {
    total_devices_u64 = 0;
  };

  msg!(
    "Total devices: {}. Dc burned: {}.",
    total_devices_u64,
    epoch_info.dc_burned
  );

  let total_devices = PreciseNumber::new(total_devices_u64.into()).unwrap();
  let devices_with_fee = total_devices
    .checked_mul(
      &PreciseNumber::new(u128::from(ctx.accounts.sub_dao.onboarding_dc_fee)).unwrap(),
    )
    .unwrap()
    .checked_div(&PreciseNumber::new(100000_u128).unwrap()) // Need onboarding fee in dollars
    .unwrap();

  // sqrt(x) = e^(ln(x)/2)
  // x^1/4 = e^(ln(x)/4))
  let one = PreciseNumber::one();
  let d = if epoch_info.dc_burned > 0 {
    std::cmp::max(
      one.clone(),
      dc_burned
        .log()
        .unwrap()
        .checked_div(&TWO_PREC.clone().signed())
        .unwrap()
        .exp()
        .unwrap(),
    )
  } else {
    one.clone()
  };

  let vehnt_staked = PreciseNumber::new(epoch_info.vehnt_at_epoch_start.into())
    .unwrap()
    .checked_div(&PreciseNumber::new(100000000_u128).unwrap()) // vehnt has 8 decimals
    .unwrap();

  let v = std::cmp::max(one.clone(), vehnt_staked);

  let a = if total_devices_u64 > 0 && ctx.accounts.sub_dao.onboarding_dc_fee > 0 {
    std::cmp::max(
      one,
      devices_with_fee
        .log()
        .unwrap()
        .checked_div(&FOUR_PREC.clone().signed())
        .unwrap()
        .exp()
        .unwrap(),
    )
  } else {
    one
  };

  let utility_score_prec = d
    .checked_mul(&a)
    .unwrap()
    .checked_mul(&v)
    .unwrap();
  // Convert to u128 with 12 decimals of precision
  let utility_score = utility_score_prec
    .checked_mul(
      &PreciseNumber::new(1000000000000_u128).unwrap(), // u128 with 12 decimal places
    )
    .unwrap()
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

  if ctx.accounts.dao_epoch_info.num_utility_scores_calculated >= ctx.accounts.dao.num_sub_daos {
    ctx.accounts.dao_epoch_info.done_calculating_scores = true;
  }

  Ok(())
}
