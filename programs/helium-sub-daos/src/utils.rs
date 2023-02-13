use crate::{error::ErrorCode, state::*, TESTING};
use anchor_lang::{prelude::*, solana_program::instruction::Instruction, InstructionData};
use shared_utils::{precise_number::PreciseNumber, signed_precise_number::SignedPreciseNumber};
use std::{cmp::Ordering, convert::TryInto};
use time::{Duration, OffsetDateTime};
use voter_stake_registry::state::{LockupKind, PositionV0, VotingMintConfigV0};

pub trait OrArithError<T> {
  fn or_arith_error(self) -> Result<T>;
}

impl OrArithError<PreciseNumber> for Option<PreciseNumber> {
  fn or_arith_error(self) -> Result<PreciseNumber> {
    self.ok_or_else(|| ErrorCode::ArithmeticError.into())
  }
}

impl OrArithError<SignedPreciseNumber> for Option<SignedPreciseNumber> {
  fn or_arith_error(self) -> Result<SignedPreciseNumber> {
    self.ok_or_else(|| ErrorCode::ArithmeticError.into())
  }
}

pub const EPOCH_LENGTH: i64 = 24 * 60 * 60;

pub fn current_epoch(unix_timestamp: i64) -> u64 {
  (unix_timestamp / (EPOCH_LENGTH)).try_into().unwrap()
}

pub fn next_epoch_ts(unix_timestamp: i64) -> u64 {
  (current_epoch(unix_timestamp) + 1) * u64::try_from(EPOCH_LENGTH).unwrap()
}

pub fn update_subdao_vehnt(
  sub_dao: &mut SubDaoV0,
  curr_epoch_info: &mut SubDaoEpochInfoV0,
  curr_ts: i64,
) -> Result<()> {
  if curr_ts < sub_dao.vehnt_last_calculated_ts {
    return Ok(());
  }

  msg!(
    "Current vehnt is {} with last updated of {}. Fast forwarding to {} at fall rate {}",
    sub_dao.vehnt_delegated,
    sub_dao.vehnt_last_calculated_ts,
    curr_ts,
    sub_dao.vehnt_fall_rate
  );

  // If last calculated was more than an epoch ago
  let epoch_start = curr_epoch_info.start_ts();
  if epoch_start
    .checked_sub(sub_dao.vehnt_last_calculated_ts)
    .unwrap()
    > EPOCH_LENGTH
    && !TESTING
  // Allow this check to be bypassed when testing so we can run
  // checks against this method without having to update _every_ epoch
  {
    return Err(error!(ErrorCode::MustCalculateVehntLinearly));
  }

  // Step 1. Update veHNT up to the point that this epoch starts
  if epoch_start > sub_dao.vehnt_last_calculated_ts {
    let fall = sub_dao
      .vehnt_fall_rate
      .checked_mul(
        u128::try_from(epoch_start)
          .unwrap()
          .checked_sub(u128::try_from(sub_dao.vehnt_last_calculated_ts).unwrap())
          .unwrap(),
      )
      .unwrap();

    sub_dao.vehnt_delegated = sub_dao.vehnt_delegated.checked_sub(fall).unwrap();
  }

  // If sub dao epoch info account was just created, log the vehnt
  if !curr_epoch_info.initialized {
    msg!(
      "Setting vehnt_at_epoch_start to {}",
      sub_dao.vehnt_delegated
    );
    curr_epoch_info.vehnt_at_epoch_start =
      u64::try_from(apply_fall_rate_factor(sub_dao.vehnt_delegated).unwrap()).unwrap();
  }

  // Step 2. Update fall rate according to this epoch's closed position corrections
  if curr_epoch_info.fall_rates_from_closing_positions > 0
    || curr_epoch_info.vehnt_in_closing_positions > 0
  {
    msg!(
      "Correcting fall rate by {} and vehnt by {} due to closed positions",
      curr_epoch_info.fall_rates_from_closing_positions,
      curr_epoch_info.vehnt_in_closing_positions
    );
    sub_dao.vehnt_fall_rate = sub_dao
      .vehnt_fall_rate
      .checked_sub(curr_epoch_info.fall_rates_from_closing_positions)
      .unwrap();

    sub_dao.vehnt_delegated = sub_dao.vehnt_delegated.saturating_sub(
      u128::from(curr_epoch_info.vehnt_in_closing_positions)
        .checked_mul(FALL_RATE_FACTOR)
        .unwrap(),
    );
    // Since this has already been applied, set to 0
    curr_epoch_info.fall_rates_from_closing_positions = 0;
    curr_epoch_info.vehnt_in_closing_positions = 0;
  }

  // Step 3. Update veHNT up to now (from start of epoch) using the current fall rate. At this point, closing positions are effectively ignored.
  let fall = sub_dao
    .vehnt_fall_rate
    .checked_mul(
      u128::try_from(curr_ts)
        .unwrap()
        .checked_sub(
          u128::try_from(std::cmp::max(sub_dao.vehnt_last_calculated_ts, epoch_start)).unwrap(),
        )
        .unwrap(),
    )
    .unwrap();

  sub_dao.vehnt_delegated = sub_dao.vehnt_delegated.saturating_sub(fall);
  sub_dao.vehnt_last_calculated_ts = curr_ts;

  Ok(())
}

pub fn create_cron(execution_ts: i64, offset: i64) -> String {
  let expiry_dt = OffsetDateTime::from_unix_timestamp(execution_ts)
    .ok()
    .unwrap()
    .checked_add(Duration::new(offset, 0)) // call purge ix two hours after expiry
    .unwrap();
  format!(
    "0 {:?} {:?} {:?} {:?} * {:?}",
    expiry_dt.minute(),
    expiry_dt.hour(),
    expiry_dt.day(),
    expiry_dt.month(),
    expiry_dt.year(),
  )
}

pub const FALL_RATE_FACTOR: u128 = 1_000_000_000_000;

pub fn calculate_fall_rate(curr_vp: u64, future_vp: u64, num_seconds: u64) -> Option<u128> {
  if num_seconds == 0 {
    return Some(0);
  }

  let diff: u128 = u128::from(curr_vp.checked_sub(future_vp).unwrap())
    .checked_mul(FALL_RATE_FACTOR)
    .unwrap(); // add decimals of precision for fall rate calculation

  // diff / num_seconds but rounded to the ceil. That way we always underestimate the amount of veHNT
  // using the fall rate, which means we never end up with leftover vehnt that can't be accounted for
  (diff
    .checked_add(num_seconds.into())
    .unwrap()
    .checked_sub(1)
    .unwrap())
  .checked_div(num_seconds.into())
}

#[derive(Debug)]
pub struct VehntInfo {
  pub has_genesis: bool,
  pub vehnt_at_curr_ts: u64,
  pub pre_genesis_end_fall_rate: u128,
  pub post_genesis_end_fall_rate: u128,
  pub genesis_end_vehnt_correction: u64,
  pub genesis_end_fall_rate_correction: u128,
  pub end_vehnt_correction: u64,
  pub end_fall_rate_correction: u128,
}
pub fn caclulate_vhnt_info(
  curr_ts: i64,
  position: &PositionV0,
  voting_mint_config: &VotingMintConfigV0,
) -> Result<VehntInfo> {
  let vehnt_at_curr_ts = position.voting_power(voting_mint_config, curr_ts)?;

  let has_genesis = position.genesis_end >= curr_ts;
  let seconds_to_genesis = if has_genesis {
    u64::try_from(
      position
        .genesis_end
        .checked_sub(curr_ts)
        .unwrap()
        // Genesis end is inclusive (the genesis will go away at exactly genesis end), so subtract 1 second
        // We want to calculate the fall rates before genesis ends
        .checked_sub(1)
        .unwrap(),
    )
    .unwrap()
  } else {
    0
  };
  let seconds_from_genesis_to_end = if has_genesis {
    u64::try_from(
      position
        .lockup
        .end_ts
        .checked_sub(position.genesis_end)
        .unwrap(),
    )
    .unwrap()
  } else {
    position.lockup.seconds_left(curr_ts)
  };
  // One second before genesis end, the last moment we have the multiplier
  let vehnt_at_genesis_end = position.voting_power(
    voting_mint_config,
    curr_ts
      .checked_add(i64::try_from(seconds_to_genesis).unwrap())
      .unwrap(),
  )?;
  let vehnt_at_genesis_end_exact =
    position.voting_power(voting_mint_config, position.genesis_end)?;
  let vehnt_at_position_end = position.voting_power(voting_mint_config, position.lockup.end_ts)?;

  let pre_genesis_end_fall_rate =
    calculate_fall_rate(vehnt_at_curr_ts, vehnt_at_genesis_end, seconds_to_genesis).unwrap();
  let post_genesis_end_fall_rate = calculate_fall_rate(
    vehnt_at_genesis_end_exact,
    vehnt_at_position_end,
    seconds_from_genesis_to_end,
  )
  .unwrap();

  let mut genesis_end_vehnt_correction = 0;
  let mut genesis_end_fall_rate_correction = 0;
  if has_genesis {
    let genesis_end_epoch_start_ts =
      i64::try_from(current_epoch(position.genesis_end)).unwrap() * EPOCH_LENGTH;
    if position.lockup.kind == LockupKind::Cliff {
      genesis_end_fall_rate_correction = pre_genesis_end_fall_rate
        .checked_sub(post_genesis_end_fall_rate)
        .unwrap();
    }

    // Subtract the genesis bonus from the vehnt.
    // When we do this, we're overcorrecting because the fall rate (corrected to post-genesis)
    // is also taking off vehnt for the time period between closing info start and genesis end.
    // So add that fall rate back in.
    genesis_end_vehnt_correction = position
      .voting_power(voting_mint_config, genesis_end_epoch_start_ts)?
      .checked_sub(vehnt_at_genesis_end_exact)
      .unwrap()
      // Correction factor
      .checked_sub(
        u64::try_from(
          post_genesis_end_fall_rate
            .checked_mul(
              u128::try_from(
                position
                  .genesis_end
                  .checked_sub(genesis_end_epoch_start_ts)
                  .unwrap(),
              )
              .unwrap(),
            )
            .unwrap()
            .checked_div(FALL_RATE_FACTOR)
            .unwrap(),
        )
        .unwrap(),
      )
      .unwrap();
  }

  let mut end_fall_rate_correction = 0;
  let mut end_vehnt_correction = 0;
  if position.lockup.kind == LockupKind::Cliff {
    let end_epoch_start_ts =
      i64::try_from(current_epoch(position.lockup.end_ts)).unwrap() * EPOCH_LENGTH;
    let vehnt_at_closing_epoch_start =
      position.voting_power(voting_mint_config, end_epoch_start_ts)?;

    end_vehnt_correction = vehnt_at_closing_epoch_start;
    end_fall_rate_correction = post_genesis_end_fall_rate;
  }

  Ok(VehntInfo {
    has_genesis,
    pre_genesis_end_fall_rate,
    post_genesis_end_fall_rate,
    vehnt_at_curr_ts,
    genesis_end_fall_rate_correction,
    genesis_end_vehnt_correction,
    end_fall_rate_correction,
    end_vehnt_correction,
  })
}

// Use bankers rounding
fn apply_fall_rate_factor(item: u128) -> Option<u128> {
  let fall_rate_sub_one = FALL_RATE_FACTOR / 10;
  let lsb = item.checked_div(fall_rate_sub_one).unwrap() % 10;
  let round_divide = item.checked_div(FALL_RATE_FACTOR).unwrap();
  let last_seen_bit = round_divide % 10;
  match lsb.cmp(&5) {
    Ordering::Equal => {
      // bankers round
      if last_seen_bit % 2 == 0 {
        Some(round_divide)
      } else {
        round_divide.checked_add(1)
      }
    }
    Ordering::Less => Some(round_divide),
    Ordering::Greater => round_divide.checked_add(1),
  }
}

pub fn construct_calculate_kickoff_ix(
  dao: Pubkey,
  sub_dao: Pubkey,
  hnt_mint: Pubkey,
  active_device_aggregator: Pubkey,
  system_program: Pubkey,
  token_program: Pubkey,
  circuit_breaker_program: Pubkey,
) -> Instruction {
  Instruction {
    program_id: crate::ID,
    accounts: crate::accounts::CalculateKickoffV0 {
      dao,
      sub_dao,
      hnt_mint,
      active_device_aggregator,
      system_program,
      token_program,
      circuit_breaker_program
    }.to_account_metas(Some(true)),
    data: crate::instruction::CalculateKickoffV0 {}.data()
  }
}

pub fn construct_issue_rewards_kickoff_ix(
  dao: Pubkey,
  sub_dao: Pubkey,
  hnt_mint: Pubkey,
  dnt_mint: Pubkey,
  system_program: Pubkey,
  token_program: Pubkey,
  circuit_breaker_program: Pubkey,
) -> Instruction {
  Instruction {
    program_id: crate::ID,
    accounts: crate::accounts::IssueRewardsKickoffV0 {
      dao,
      sub_dao,
      hnt_mint,
      dnt_mint,
      system_program,
      token_program,
      circuit_breaker_program
    }.to_account_metas(Some(true)),
    data: crate::instruction::IssueRewardsKickoffV0 {}.data(),
  }
}

pub fn construct_issue_hst_kickoff_ix(
  dao: Pubkey,
  hnt_mint: Pubkey,
  system_program: Pubkey,
  token_program: Pubkey,
  circuit_breaker_program: Pubkey,
) -> Instruction {
  Instruction {
    program_id: crate::ID,
    accounts: crate::accounts::IssueHstKickoffV0 {
      dao,
      hnt_mint,
      system_program,
      token_program,
      circuit_breaker_program
    }.to_account_metas(Some(true)),
    data: crate::instruction::IssueHstKickoffV0 {}.data(),
  }
}
