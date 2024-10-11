use std::{
  cmp::{min, Ordering},
  convert::TryInto,
};

use anchor_lang::prelude::*;
use voter_stake_registry::state::{LockupKind, PositionV0, VotingMintConfigV0};

use crate::error::ErrorCode;

pub const EPOCH_LENGTH: i64 = 24 * 60 * 60;

pub fn current_epoch(unix_timestamp: i64) -> u64 {
  (unix_timestamp / (EPOCH_LENGTH)).try_into().unwrap()
}

pub fn next_epoch_ts(unix_timestamp: i64) -> u64 {
  (current_epoch(unix_timestamp) + 1) * u64::try_from(EPOCH_LENGTH).unwrap()
}

pub const FALL_RATE_FACTOR: u128 = 1_000_000_000_000;

pub fn calculate_fall_rate(curr_vp: u128, future_vp: u128, num_seconds: u64) -> Option<u128> {
  if num_seconds == 0 {
    return Some(0);
  }

  let diff: u128 = curr_vp.checked_sub(future_vp).unwrap();

  diff.checked_div(num_seconds.into())
}

#[derive(Debug)]
pub struct VetokenInfo {
  pub has_genesis: bool,
  pub vetokens_at_curr_ts: u128,
  pub pre_genesis_end_fall_rate: u128,
  pub post_genesis_end_fall_rate: u128,
  pub genesis_end_vetoken_correction: u128,
  pub genesis_end_fall_rate_correction: u128,
  pub end_vetoken_correction: u128,
  pub end_fall_rate_correction: u128,
}
pub fn calculate_vetoken_info(
  curr_ts: i64,
  position: &PositionV0,
  voting_mint_config: &VotingMintConfigV0,
) -> Result<VetokenInfo> {
  let vetokens_at_curr_ts = position.voting_power_precise(voting_mint_config, curr_ts)?;

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
  let vetokens_at_genesis_end = position.voting_power_precise(
    voting_mint_config,
    curr_ts
      .checked_add(i64::try_from(seconds_to_genesis).unwrap())
      .unwrap(),
  )?;
  let vetokens_at_genesis_end_exact = if has_genesis {
    position.voting_power_precise(voting_mint_config, position.genesis_end)?
  } else {
    position.voting_power_precise(voting_mint_config, curr_ts)?
  };
  let vetokens_at_position_end =
    position.voting_power_precise(voting_mint_config, position.lockup.end_ts)?;

  let pre_genesis_end_fall_rate = calculate_fall_rate(
    vetokens_at_curr_ts,
    vetokens_at_genesis_end,
    seconds_to_genesis,
  )
  .unwrap();
  let post_genesis_end_fall_rate = calculate_fall_rate(
    vetokens_at_genesis_end_exact,
    vetokens_at_position_end,
    seconds_from_genesis_to_end,
  )
  .unwrap();

  let mut genesis_end_vetokens_correction = 0;
  let mut genesis_end_fall_rate_correction = 0;
  if has_genesis {
    let genesis_end_epoch_start_ts =
      i64::try_from(current_epoch(position.genesis_end)).unwrap() * EPOCH_LENGTH;

    if position.lockup.kind == LockupKind::Cliff {
      genesis_end_fall_rate_correction = pre_genesis_end_fall_rate
        .checked_sub(post_genesis_end_fall_rate)
        .unwrap();
    }

    // Subtract the genesis bonus from the vetokens.
    // When we do this, we're overcorrecting because the fall rate (corrected to post-genesis)
    // is also taking off vetokens for the time period between closing info start and genesis end.
    // So add that fall rate back in.
    // Only do this if the genesis end epoch isn't the same as the position end epoch.
    // If these are the same, then the full vetokens at epoch start is already being taken off.
    if position.lockup.kind == LockupKind::Constant
      || current_epoch(position.genesis_end) != current_epoch(position.lockup.end_ts)
    {
      // edge case, if the genesis end is _exactly_ the start of the epoch, getting the voting power at the epoch start
      // will not include the genesis. When this happens, we'll miss a vetokens correction
      if genesis_end_epoch_start_ts == position.genesis_end {
        genesis_end_vetokens_correction = position
          .voting_power_precise(voting_mint_config, genesis_end_epoch_start_ts - 1)?
          .checked_sub(vetokens_at_genesis_end_exact)
          .unwrap();
      } else {
        genesis_end_vetokens_correction = position
          .voting_power_precise(voting_mint_config, genesis_end_epoch_start_ts)?
          .checked_sub(vetokens_at_genesis_end_exact)
          .unwrap()
          // Correction factor
          .checked_sub(
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
              .unwrap(),
          )
          .unwrap();
      }
    }
  }

  let mut end_fall_rate_correction = 0;
  let mut end_vetokens_correction = 0;
  if position.lockup.kind == LockupKind::Cliff {
    let end_epoch_start_ts =
      i64::try_from(current_epoch(position.lockup.end_ts)).unwrap() * EPOCH_LENGTH;
    let vetokens_at_closing_epoch_start =
      position.voting_power_precise(voting_mint_config, end_epoch_start_ts)?;

    end_vetokens_correction = vetokens_at_closing_epoch_start;
    end_fall_rate_correction = post_genesis_end_fall_rate;
  }

  Ok(VetokenInfo {
    has_genesis,
    pre_genesis_end_fall_rate,
    post_genesis_end_fall_rate,
    vetokens_at_curr_ts,
    genesis_end_fall_rate_correction,
    genesis_end_vetoken_correction: genesis_end_vetokens_correction,
    end_fall_rate_correction,
    end_vetoken_correction: end_vetokens_correction,
  })
}

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
