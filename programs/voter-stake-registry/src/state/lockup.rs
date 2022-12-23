use crate::error::*;
use crate::vote_weight_record;
use anchor_lang::prelude::*;
use std::convert::TryFrom;

// Generate a VoteWeightRecord Anchor wrapper, owned by the current program.
// VoteWeightRecords are unique in that they are defined by the SPL governance
// program, but they are actually owned by this program.
vote_weight_record!(crate::ID);

/// Seconds in one day.
pub const SECS_PER_DAY: u64 = 86_400;

/// Seconds in one month.
pub const SECS_PER_MONTH: u64 = 365 * SECS_PER_DAY / 12;

/// Maximum acceptable number of lockup periods.
///
/// In the linear vesting voting power computation, a factor like
/// `periods^2 * period_secs` is used. With the current setting
/// that would be 36500^2 * SECS_PER_MONTH << 2^64.
///
/// This setting limits the maximum lockup duration for lockup methods
/// with daily periods to 200 years.
pub const MAX_LOCKUP_PERIODS: u32 = 365 * 200;

pub const MAX_LOCKUP_IN_FUTURE_SECS: i64 = 100 * 365 * 24 * 60 * 60;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Lockup {
  /// Start of the lockup.
  ///
  /// Note, that if start_ts is in the future, the funds are nevertheless
  /// locked up!
  ///
  /// Similarly vote power computations don't care about start_ts and always
  /// assume the full interval from now to end_ts.
  pub start_ts: i64,

  /// End of the lockup.
  pub end_ts: i64,

  /// Type of lockup.
  pub kind: LockupKind,
}

impl Default for Lockup {
  fn default() -> Self {
    Self {
      kind: LockupKind::None,
      start_ts: 0,
      end_ts: 0,
    }
  }
}

impl Lockup {
  /// Create lockup for a given period
  pub fn new_from_periods(
    kind: LockupKind,
    curr_ts: i64,
    start_ts: i64,
    periods: u32,
  ) -> Result<Self> {
    require_gt!(
      curr_ts + MAX_LOCKUP_IN_FUTURE_SECS,
      start_ts,
      VsrError::DepositStartTooFarInFuture
    );
    require_gte!(MAX_LOCKUP_PERIODS, periods, VsrError::InvalidLockupPeriod);
    Ok(Self {
      kind,
      start_ts,
      end_ts: start_ts
        .checked_add(
          i64::try_from((periods as u64).checked_mul(kind.period_secs()).unwrap()).unwrap(),
        )
        .unwrap(),
    })
  }

  /// True when the lockup is finished.
  pub fn expired(&self, curr_ts: i64) -> bool {
    self.seconds_left(curr_ts) == 0
  }

  // Total seconds in lockup
  pub fn total_seconds(&self) -> u64 {
    (self.end_ts - self.start_ts) as u64
  }

  /// Number of seconds left in the lockup.
  /// May be more than end_ts-start_ts if curr_ts < start_ts.
  pub fn seconds_left(&self, mut curr_ts: i64) -> u64 {
    if self.kind == LockupKind::Constant {
      curr_ts = self.start_ts;
    }
    if curr_ts >= self.end_ts {
      0
    } else {
      (self.end_ts - curr_ts) as u64
    }
  }

  /// Number of seconds since the lockup expired.
  /// Returns 0 if the lockup hasn't expired
  pub fn seconds_since_expiry(&self, curr_ts: i64) -> u64 {
    if !self.expired(curr_ts) {
      return 0;
    }
    (curr_ts - self.end_ts) as u64
  }
}

#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub enum LockupKind {
  /// No lockup, tokens can be withdrawn as long as not engaged in a proposal.
  None,

  /// Lock up for a number of days
  Cliff,

  /// Lock up permanently. The number of days specified becomes the minimum
  /// unlock period when the deposit (or a part of it) is changed to Cliff.
  Constant,
}

impl LockupKind {
  /// The lockup length is specified by passing the number of lockup periods
  /// to create_deposit_entry. This describes a period's length.
  ///
  /// For vesting lockups, the period length is also the vesting period.
  pub fn period_secs(&self) -> u64 {
    match self {
      LockupKind::None => 0,
      LockupKind::Cliff => SECS_PER_DAY,    // arbitrary choice
      LockupKind::Constant => SECS_PER_DAY, // arbitrary choice
    }
  }

  /// Lockups cannot decrease in strictness
  pub fn strictness(&self) -> u8 {
    match self {
      LockupKind::None => 0,
      LockupKind::Cliff => 1, // can freely move between Cliff and Constant
      LockupKind::Constant => 1,
    }
  }

  pub fn is_none(&self) -> bool {
    match self {
      LockupKind::None => true,
      LockupKind::Cliff => false,
      LockupKind::Constant => false,
    }
  }
}

#[cfg(test)]
mod tests {
  use crate::state::PositionV0;

  use super::*;

  // intentionally not a multiple of a day
  const MAX_SECS_LOCKED: u64 = 365 * 24 * 60 * 60 + 7 * 60 * 60;
  const MAX_DAYS_LOCKED: f64 = MAX_SECS_LOCKED as f64 / (24.0 * 60.0 * 60.0);

  #[test]
  pub fn voting_power_cliff_start() -> Result<()> {
    // 10 tokens with 6 decimals.
    let amount_deposited = 10 * 1_000_000;
    let expected_voting_power = locked_cliff_power(amount_deposited, 10.0);
    run_test_voting_power(TestVotingPower {
      expected_voting_power,
      amount_deposited,
      days_total: 10.0,
      curr_day: 0.0,
      kind: LockupKind::Cliff,
    })
  }

  #[test]
  pub fn voting_power_cliff_one_third_day() -> Result<()> {
    // 10 tokens with 6 decimals.
    let amount_deposited = 10 * 1_000_000;
    let expected_voting_power = locked_cliff_power(amount_deposited, 9.67);
    run_test_voting_power(TestVotingPower {
      expected_voting_power,
      amount_deposited,
      days_total: 10.0,
      curr_day: 0.33,
      kind: LockupKind::Cliff,
    })
  }

  #[test]
  pub fn voting_power_cliff_half_day() -> Result<()> {
    // 10 tokens with 6 decimals.
    let amount_deposited = 10 * 1_000_000;
    let expected_voting_power = locked_cliff_power(amount_deposited, 9.5);
    run_test_voting_power(TestVotingPower {
      expected_voting_power,
      amount_deposited,
      days_total: 10.0,
      curr_day: 0.5,
      kind: LockupKind::Cliff,
    })
  }

  #[test]
  pub fn voting_power_cliff_two_thirds_day() -> Result<()> {
    // 10 tokens with 6 decimals.
    let amount_deposited = 10 * 1_000_000;
    let expected_voting_power = locked_cliff_power(amount_deposited, 9.34);
    run_test_voting_power(TestVotingPower {
      expected_voting_power,
      amount_deposited,
      days_total: 10.0,
      curr_day: 0.66,
      kind: LockupKind::Cliff,
    })
  }

  #[test]
  pub fn voting_power_cliff_one_day() -> Result<()> {
    // 10 tokens with 6 decimals.
    let amount_deposited = 10 * 1_000_000;
    let expected_voting_power = locked_cliff_power(amount_deposited, 9.0);
    run_test_voting_power(TestVotingPower {
      expected_voting_power,
      amount_deposited,
      days_total: 10.0,
      curr_day: 1.0,
      kind: LockupKind::Cliff,
    })
  }

  #[test]
  pub fn voting_power_cliff_one_day_one_third() -> Result<()> {
    // 10 tokens with 6 decimals.
    let amount_deposited = 10 * 1_000_000;
    let expected_voting_power = locked_cliff_power(amount_deposited, 8.67);
    run_test_voting_power(TestVotingPower {
      expected_voting_power,
      amount_deposited,
      days_total: 10.0,
      curr_day: 1.33,
      kind: LockupKind::Cliff,
    })
  }

  #[test]
  pub fn voting_power_cliff_two_days() -> Result<()> {
    // 10 tokens with 6 decimals.
    let amount_deposited = 10 * 1_000_000;
    // (8/2555) * deposit w/ 6 decimals.
    let expected_voting_power = locked_cliff_power(amount_deposited, 8.0);
    run_test_voting_power(TestVotingPower {
      expected_voting_power,
      amount_deposited,
      days_total: 10.0,
      curr_day: 2.0,
      kind: LockupKind::Cliff,
    })
  }

  #[test]
  pub fn voting_power_cliff_nine_dot_nine_days() -> Result<()> {
    // 10 tokens with 6 decimals.
    let amount_deposited = 10 * 1_000_000;
    let expected_voting_power = locked_cliff_power(amount_deposited, 0.1);
    run_test_voting_power(TestVotingPower {
      expected_voting_power,
      amount_deposited,
      days_total: 10.0,
      curr_day: 9.9,
      kind: LockupKind::Cliff,
    })
  }

  #[test]
  pub fn voting_power_cliff_ten_days() -> Result<()> {
    run_test_voting_power(TestVotingPower {
      expected_voting_power: 0, // (0/MAX_DAYS_LOCKED) * deposit w/ 6 decimals.
      amount_deposited: 10 * 1_000_000,
      days_total: 10.0,
      curr_day: 10.0,
      kind: LockupKind::Cliff,
    })
  }

  #[test]
  pub fn voting_power_cliff_ten_dot_one_days() -> Result<()> {
    run_test_voting_power(TestVotingPower {
      expected_voting_power: 0, // (0/MAX_DAYS_LOCKED) * deposit w/ 6 decimals.
      amount_deposited: 10 * 1_000_000, // 10 tokens with 6 decimals.
      days_total: 10.0,
      curr_day: 10.1,
      kind: LockupKind::Cliff,
    })
  }

  #[test]
  pub fn voting_power_cliff_eleven_days() -> Result<()> {
    run_test_voting_power(TestVotingPower {
      expected_voting_power: 0, // (0/MAX_DAYS_LOCKED) * deposit w/ 6 decimals.
      amount_deposited: 10 * 1_000_000, // 10 tokens with 6 decimals.
      days_total: 10.0,
      curr_day: 10.1,
      kind: LockupKind::Cliff,
    })
  }

  struct TestVotingPower {
    amount_deposited: u64,
    days_total: f64,
    curr_day: f64,
    expected_voting_power: u64,
    kind: LockupKind,
  }

  fn run_test_voting_power(t: TestVotingPower) -> Result<()> {
    let start_ts = 1634929833;
    let end_ts = start_ts + days_to_secs(t.days_total);
    let d = PositionV0 {
      registrar: Pubkey::new_unique(),
      mint: Pubkey::new_unique(),
      bump_seed: 0,
      num_active_votes: 0,
      voting_mint_config_idx: 0,
      amount_deposited_native: t.amount_deposited,
      lockup: Lockup {
        start_ts,
        end_ts,
        kind: t.kind,
      },
    };
    let curr_ts = start_ts + days_to_secs(t.curr_day);
    let power = d.voting_power_locked(curr_ts, 0, 0, t.amount_deposited, MAX_SECS_LOCKED, 0, 0)?;
    assert_eq!(power, t.expected_voting_power);
    Ok(())
  }

  fn days_to_secs(days: f64) -> i64 {
    let d = (SECS_PER_DAY as f64) * days;
    d.round() as i64
  }

  fn locked_cliff_power_float(amount: u64, remaining_days: f64) -> f64 {
    let relevant_days = if remaining_days < MAX_DAYS_LOCKED {
      remaining_days
    } else {
      MAX_DAYS_LOCKED
    };
    (amount as f64) * relevant_days / MAX_DAYS_LOCKED
  }

  fn locked_cliff_power(amount: u64, remaining_days: f64) -> u64 {
    locked_cliff_power_float(amount, remaining_days).floor() as u64
  }
}
