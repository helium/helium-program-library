use std::{
  cmp::{min, Ordering},
  convert::TryInto,
};

use anchor_lang::prelude::*;
use shared_utils::{precise_number::PreciseNumber, signed_precise_number::SignedPreciseNumber};
use time::{Duration, OffsetDateTime};
use voter_stake_registry::state::{LockupKind, PositionV0, Registrar, VotingMintConfigV0};

use crate::{error::ErrorCode, state::*, TESTING};

pub fn get_sub_dao_epoch_info_seed(registrar: &Registrar) -> [u8; 8] {
  current_epoch(registrar.clock_unix_timestamp()).to_le_bytes()
}

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
    sub_dao.vehnt_last_calculated_ts = epoch_start;
  }

  // If sub dao epoch info account was just created, log the vehnt
  if !curr_epoch_info.initialized {
    msg!(
      "Setting vehnt_at_epoch_start to {}, dc onboarding fees paid to {}",
      sub_dao.vehnt_delegated,
      sub_dao.dc_onboarding_fees_paid
    );
    curr_epoch_info.vehnt_at_epoch_start =
      u64::try_from(apply_fall_rate_factor(sub_dao.vehnt_delegated).unwrap()).unwrap();
    curr_epoch_info.dc_onboarding_fees_paid = sub_dao.dc_onboarding_fees_paid;
  } else if curr_epoch_info.dc_onboarding_fees_paid == 0 {
    // TODO: Remove this after the first epoch using the new A score. This just makes sure we don't get one epoch with 0 A score
    curr_epoch_info.dc_onboarding_fees_paid = sub_dao.dc_onboarding_fees_paid;
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

    sub_dao.vehnt_delegated = sub_dao
      .vehnt_delegated
      .saturating_sub(curr_epoch_info.vehnt_in_closing_positions);
    // Since this has already been applied, set to 0
    curr_epoch_info.fall_rates_from_closing_positions = 0;
    curr_epoch_info.vehnt_in_closing_positions = 0;
  }

  // Step 3. Update veHNT up to now (from start of epoch) using the current fall rate. At this point, closing positions are effectively ignored.
  if current_epoch(curr_ts) == curr_epoch_info.epoch {
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
  }

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

pub trait PrecisePosition {
  fn voting_power_precise(
    &self,
    voting_mint_config: &VotingMintConfigV0,
    curr_ts: i64,
  ) -> Result<u128>;
  fn voting_power_precise_locked_precise(
    &self,
    curr_ts: i64,
    max_locked_vote_weight: u128,
    lockup_saturation_secs: u64,
  ) -> Result<u128>;

  fn voting_power_precise_cliff_precise(
    &self,
    curr_ts: i64,
    max_locked_vote_weight: u128,
    lockup_saturation_secs: u64,
  ) -> Result<u128>;
}

impl PrecisePosition for PositionV0 {
  fn voting_power_precise(
    &self,
    voting_mint_config: &VotingMintConfigV0,
    curr_ts: i64,
  ) -> Result<u128> {
    let baseline_vote_weight = (voting_mint_config
      .baseline_vote_weight(self.amount_deposited_native)?)
    .checked_mul(FALL_RATE_FACTOR)
    .unwrap();
    let max_locked_vote_weight =
      voting_mint_config.max_extra_lockup_vote_weight(self.amount_deposited_native)?;
    let genesis_multiplier =
      if curr_ts < self.genesis_end && voting_mint_config.genesis_vote_power_multiplier > 0 {
        voting_mint_config.genesis_vote_power_multiplier
      } else {
        1
      };

    let locked_vote_weight = self.voting_power_precise_locked_precise(
      curr_ts,
      max_locked_vote_weight,
      voting_mint_config.lockup_saturation_secs,
    )?;

    locked_vote_weight
      .checked_add(baseline_vote_weight)
      .unwrap()
      .checked_mul(genesis_multiplier as u128)
      .ok_or(error!(ErrorCode::ArithmeticError))
  }

  /// Vote power contribution from locked funds only.
  fn voting_power_precise_locked_precise(
    &self,
    curr_ts: i64,
    max_locked_vote_weight: u128,
    lockup_saturation_secs: u64,
  ) -> Result<u128> {
    if self.lockup.expired(curr_ts) || (max_locked_vote_weight == 0) {
      return Ok(0);
    }

    match self.lockup.kind {
      LockupKind::None => Ok(0),
      LockupKind::Cliff => self.voting_power_precise_cliff_precise(
        curr_ts,
        max_locked_vote_weight,
        lockup_saturation_secs,
      ),
      LockupKind::Constant => self.voting_power_precise_cliff_precise(
        curr_ts,
        max_locked_vote_weight,
        lockup_saturation_secs,
      ),
    }
  }

  fn voting_power_precise_cliff_precise(
    &self,
    curr_ts: i64,
    max_locked_vote_weight: u128,
    lockup_saturation_secs: u64,
  ) -> Result<u128> {
    let remaining = min(self.lockup.seconds_left(curr_ts), lockup_saturation_secs);
    Ok(
      (max_locked_vote_weight)
        .checked_mul(remaining as u128)
        .unwrap()
        .checked_mul(FALL_RATE_FACTOR)
        .unwrap()
        .checked_div(lockup_saturation_secs as u128)
        .unwrap(),
    )
  }
}

pub fn calculate_fall_rate(curr_vp: u128, future_vp: u128, num_seconds: u64) -> Option<u128> {
  if num_seconds == 0 {
    return Some(0);
  }

  let diff: u128 = curr_vp.checked_sub(future_vp).unwrap();

  diff.checked_div(num_seconds.into())
}

#[derive(Debug)]
pub struct VehntInfo {
  pub has_genesis: bool,
  pub vehnt_at_curr_ts: u128,
  pub pre_genesis_end_fall_rate: u128,
  pub post_genesis_end_fall_rate: u128,
  pub genesis_end_vehnt_correction: u128,
  pub genesis_end_fall_rate_correction: u128,
  pub end_vehnt_correction: u128,
  pub end_fall_rate_correction: u128,
}
pub fn caclulate_vhnt_info(
  curr_ts: i64,
  position: &PositionV0,
  voting_mint_config: &VotingMintConfigV0,
  expiration_ts: i64,
) -> Result<VehntInfo> {
  let vehnt_at_curr_ts = position.voting_power_precise(voting_mint_config, curr_ts)?;

  let has_genesis = position.genesis_end > curr_ts;
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
  let delegation_end_ts = if expiration_ts == 0 {
    position.lockup.effective_end_ts()
  } else {
    min(expiration_ts, position.lockup.effective_end_ts())
  };
  let seconds_from_genesis_to_end = if has_genesis {
    u64::try_from(delegation_end_ts)
      .unwrap()
      .saturating_sub(u64::try_from(position.genesis_end).unwrap())
  } else if expiration_ts == 0 {
    position.lockup.seconds_left(curr_ts)
  } else {
    min(
      u64::try_from(expiration_ts.checked_sub(curr_ts).unwrap()).unwrap(),
      position.lockup.seconds_left(curr_ts),
    )
  };
  // One second before genesis end, the last moment we have the multiplier
  let vehnt_at_genesis_end = position.voting_power_precise(
    voting_mint_config,
    curr_ts
      .checked_add(i64::try_from(seconds_to_genesis).unwrap())
      .unwrap(),
  )?;
  let vehnt_at_genesis_end_exact = if has_genesis {
    position.voting_power_precise(voting_mint_config, position.genesis_end)?
  } else {
    position.voting_power_precise(voting_mint_config, curr_ts)?
  };

  let vehnt_at_delegation_end =
    position.voting_power_precise(voting_mint_config, delegation_end_ts)?;

  let pre_genesis_end_fall_rate =
    calculate_fall_rate(vehnt_at_curr_ts, vehnt_at_genesis_end, seconds_to_genesis).unwrap();
  let post_genesis_end_fall_rate = if position.genesis_end < delegation_end_ts {
    calculate_fall_rate(
      vehnt_at_genesis_end_exact,
      vehnt_at_delegation_end,
      seconds_from_genesis_to_end,
    )
    .unwrap()
  } else {
    0
  };

  let mut genesis_end_vehnt_correction = 0;
  let mut genesis_end_fall_rate_correction = 0;
  if has_genesis && position.genesis_end < delegation_end_ts {
    let genesis_end_epoch_start_ts =
      i64::try_from(current_epoch(position.genesis_end)).unwrap() * EPOCH_LENGTH;

    if position.lockup.kind == LockupKind::Cliff && position.genesis_end != delegation_end_ts {
      genesis_end_fall_rate_correction = pre_genesis_end_fall_rate
        .checked_sub(post_genesis_end_fall_rate)
        .unwrap();
    }

    if position.lockup.kind == LockupKind::Constant
      || current_epoch(position.genesis_end) <= current_epoch(delegation_end_ts)
    {
      // When the epoch boundary hits, we pretend the landrush doesn't exist anymore,
      // so we subtract out the difference between the genesis vehnt value and the non-genesis value
      // at the start of the epch.
      genesis_end_vehnt_correction = position
        .voting_power_precise(voting_mint_config, genesis_end_epoch_start_ts)?
        .checked_sub(
          PositionV0 {
            genesis_end: 0,
            ..position.clone()
          }
          .voting_power_precise(voting_mint_config, genesis_end_epoch_start_ts)?,
        )
        .unwrap();
    }
  }

  let mut end_fall_rate_correction = 0;
  let end_epoch_start_ts = i64::try_from(current_epoch(delegation_end_ts)).unwrap() * EPOCH_LENGTH;
  let vehnt_at_closing_epoch_start =
    position.voting_power_precise(voting_mint_config, end_epoch_start_ts)?;
  let end_vehnt_correction = vehnt_at_closing_epoch_start;
  if position.lockup.kind == LockupKind::Cliff {
    if position.genesis_end < delegation_end_ts {
      end_fall_rate_correction = post_genesis_end_fall_rate;
    } else {
      end_fall_rate_correction = pre_genesis_end_fall_rate;
    }
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
pub fn apply_fall_rate_factor(item: u128) -> Option<u128> {
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
