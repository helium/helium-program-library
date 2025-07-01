use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};
use circuit_breaker::CircuitBreaker;
use no_emit::{NoEmit, NotEmittedCounterV0};
use shared_utils::precise_number::PreciseNumber;
use voter_stake_registry::state::Registrar;

use crate::{
  current_epoch, error::ErrorCode, state::*, try_from, update_subdao_vehnt, EPOCH_LENGTH,
};

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
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(
    seeds = ["dao_epoch_info".as_bytes(), dao.key().as_ref(), &(args.epoch - 1).to_le_bytes()],
    bump,
  )]
  /// CHECK: May not have ever been initialized
  pub prev_dao_epoch_info: UncheckedAccount<'info>,
  #[account(
    init_if_needed,
    payer = payer,
    space = if dao_epoch_info.data_len() > 0 {
        dao_epoch_info.data_len()
    } else {
        DaoEpochInfoV0::size()
    },
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
  #[account(
    init_if_needed,
    payer = payer,
    space = SubDaoEpochInfoV0::SIZE,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &(args.epoch - 1).to_le_bytes()],
    bump,
  )]
  pub prev_sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(
    seeds = [b"not_emitted_counter", hnt_mint.key().as_ref()],
    seeds::program = no_emit_program.key(),
    bump
  )]
  /// CHECK: May not have ever been initialized
  pub not_emitted_counter: UncheckedAccount<'info>,
  pub no_emit_program: Program<'info, NoEmit>,
}

const SMOOTHING_FACTOR: u64 = 7;

pub fn handler(
  ctx: Context<CalculateUtilityScoreV0>,
  args: CalculateUtilityScoreArgsV0,
) -> Result<()> {
  let end_of_epoch_ts = i64::try_from(args.epoch + 1).unwrap() * EPOCH_LENGTH;
  let curr_epoch = current_epoch(Clock::get()?.unix_timestamp);
  ctx.accounts.dao_epoch_info.recent_proposals = ctx.accounts.dao.recent_proposals.clone();

  // Set total rewards, accounting for net emmissions by counting
  // burned hnt since last supply setting.
  let curr_supply = ctx.accounts.hnt_mint.supply;
  let mut prev_supply = curr_supply;
  let mut prev_total_utility_score = 0;
  let mut prev_cumulative_not_emitted = 0;
  let mut cumulative_not_emitted = 0;
  let mut prev_smoothed_hnt_burned = 0;
  let mut not_emitted = 0;

  let prev_dao_epoch_info = &mut ctx.accounts.prev_dao_epoch_info;

  if prev_dao_epoch_info.lamports() > 0 && !prev_dao_epoch_info.to_account_info().data_is_empty() {
    let info: Account<DaoEpochInfoV0> = try_from!(Account<DaoEpochInfoV0>, prev_dao_epoch_info)?;
    prev_supply = info.current_hnt_supply;
    prev_total_utility_score = info.total_utility_score;
    prev_cumulative_not_emitted = info.cumulative_not_emitted;
    prev_smoothed_hnt_burned = info.smoothed_hnt_burned;
  }

  if ctx.accounts.not_emitted_counter.lamports() > 0
    && !ctx
      .accounts
      .not_emitted_counter
      .to_account_info()
      .data_is_empty()
  {
    let info: Account<NotEmittedCounterV0> = try_from!(
      Account<NotEmittedCounterV0>,
      ctx.accounts.not_emitted_counter
    )?;
    cumulative_not_emitted = info.amount_not_emitted;
    not_emitted = info
      .amount_not_emitted
      .saturating_sub(prev_cumulative_not_emitted);
  };

  // Set smoothed hnt burned to 300 if it's not already set
  if ctx.accounts.dao_epoch_info.smoothed_hnt_burned == 0 {
    ctx.accounts.dao_epoch_info.smoothed_hnt_burned = 300;
  }
  if prev_smoothed_hnt_burned == 0 {
    prev_smoothed_hnt_burned = 300;
  }

  let total_hnt_burned = prev_supply
    .saturating_sub(curr_supply)
    .saturating_sub(not_emitted);
  ctx.accounts.dao_epoch_info.smoothed_hnt_burned = (SMOOTHING_FACTOR
    .checked_sub(1)
    .unwrap()
    .checked_mul(prev_smoothed_hnt_burned)
    .unwrap()
    .checked_div(SMOOTHING_FACTOR)
    .unwrap())
  .checked_add(total_hnt_burned.checked_div(SMOOTHING_FACTOR).unwrap())
  .unwrap();

  if ctx.accounts.dao_epoch_info.not_emitted == 0 {
    ctx.accounts.dao_epoch_info.not_emitted = not_emitted;
  }

  if ctx.accounts.dao_epoch_info.cumulative_not_emitted == 0 {
    ctx.accounts.dao_epoch_info.cumulative_not_emitted = cumulative_not_emitted;
  }

  ctx.accounts.dao_epoch_info.total_rewards = ctx
    .accounts
    .dao
    .emission_schedule
    .get_emissions_at(end_of_epoch_ts)
    .unwrap()
    .checked_add(std::cmp::min(
      ctx.accounts.dao_epoch_info.smoothed_hnt_burned,
      ctx.accounts.dao.net_emissions_cap,
    ))
    .unwrap();

  ctx.accounts.dao_epoch_info.epoch = args.epoch;

  ctx.accounts.dao_epoch_info.current_hnt_supply = curr_supply
    .checked_add(ctx.accounts.dao_epoch_info.total_rewards)
    .unwrap();

  // Until August 1st, 2025, emit the 2.9M HNT to the treasury.
  // This contract will be deployed between December 6 and December 7 at UTC midnight.
  // That means this will emit payment from December 7 to August 1st, 2025 (because epochs are paid in arrears).
  // This is a total of 237 days. 2.9M HNT / 237 days = 12236.28691983 HNT per day.
  #[allow(clippy::inconsistent_digit_grouping)]
  if !TESTING && curr_epoch * (EPOCH_LENGTH as u64) < 1754006400 {
    ctx.accounts.dao_epoch_info.current_hnt_supply = ctx
      .accounts
      .dao_epoch_info
      .current_hnt_supply
      .checked_add(12_236_28691983)
      .unwrap();
  }

  if !TESTING && args.epoch >= curr_epoch {
    return Err(error!(ErrorCode::EpochNotOver));
  }

  if !TESTING && ctx.accounts.sub_dao_epoch_info.utility_score.is_some() {
    return Err(error!(ErrorCode::UtilityScoreAlreadyCalculated));
  }

  if end_of_epoch_ts < ctx.accounts.dao.emission_schedule[0].start_unix_time {
    return Err(error!(ErrorCode::EpochTooEarly));
  }

  ctx.accounts.sub_dao_epoch_info.epoch = args.epoch;
  let epoch_end_ts = ctx.accounts.sub_dao_epoch_info.end_ts();
  update_subdao_vehnt(
    &mut ctx.accounts.sub_dao,
    &mut ctx.accounts.sub_dao_epoch_info,
    epoch_end_ts,
  )?;

  ctx.accounts.dao_epoch_info.vehnt_at_epoch_start +=
    ctx.accounts.sub_dao_epoch_info.vehnt_at_epoch_start;

  ctx.accounts.dao_epoch_info.dao = ctx.accounts.dao.key();
  ctx.accounts.sub_dao_epoch_info.sub_dao = ctx.accounts.sub_dao.key();
  ctx.accounts.sub_dao_epoch_info.bump_seed = ctx.bumps.sub_dao_epoch_info;
  ctx.accounts.sub_dao_epoch_info.initialized = true;
  ctx.accounts.prev_sub_dao_epoch_info.sub_dao = ctx.accounts.sub_dao.key();
  ctx.accounts.prev_sub_dao_epoch_info.bump_seed = ctx.bumps.prev_sub_dao_epoch_info;
  ctx.accounts.prev_sub_dao_epoch_info.epoch = args.epoch - 1;
  ctx.accounts.dao_epoch_info.bump_seed = ctx.bumps.dao_epoch_info;

  // Calculate utility score
  // utility score = V = veHNT_dnp
  let epoch_info = &mut ctx.accounts.sub_dao_epoch_info;

  // Convert veHNT to utility score:
  // 1. veHNT starts with 8 decimals
  // 2. We want 12 decimals in the final utility score
  // 3. Therefore multiply by 10^4 (since 10^12/10^8 = 10^4)
  // This is equivalent to dividing by 10^8 and multiplying by 10^12, but no lost precision
  let vehnt_staked = PreciseNumber::new(epoch_info.vehnt_at_epoch_start.into())
    .unwrap()
    .checked_mul(&PreciseNumber::new(10000_u128).unwrap()) // Multiply by 10^4 to convert from 8 to 12 decimals
    .unwrap();

  let utility_score = vehnt_staked.to_imprecise().unwrap();

  // Store utility scores for this epoch
  epoch_info.utility_score = Some(utility_score);

  let prev_epoch_info = &ctx.accounts.prev_sub_dao_epoch_info;
  let previous_percentage = prev_epoch_info.previous_percentage;

  // Initialize previous percentage if it's not already set
  ctx.accounts.prev_sub_dao_epoch_info.previous_percentage = match previous_percentage {
    // This was just deployed, so we don't have a previous utility score set
    // Set it by using the percentage of the total utility score
    0 => match prev_epoch_info.utility_score {
      Some(prev_score) => {
        if prev_total_utility_score == 0 {
          0
        } else {
          prev_score
            .checked_mul(u32::MAX as u128)
            .and_then(|x| x.checked_div(prev_total_utility_score))
            .map(|x| x as u32)
            .unwrap_or(0)
        }
      }
      // Either this is a new subnetwork or this whole program was just deployed
      None => match prev_total_utility_score {
        // If there is no previous utility score, this is a new program deployment
        // Set it by using the percentage of the total utility score
        0 => u32::MAX
          .checked_div(ctx.accounts.dao.num_sub_daos)
          .unwrap_or(0),
        // If there is a previous utility score, this is a new subnetwork
        _ => 0,
      },
    },
    _ => previous_percentage,
  };

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
