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

#[zero_copy]
pub struct Lockup {
  /// Start of the lockup.
  ///
  /// Note, that if start_ts is in the future, the funds are nevertheless
  /// locked up!
  ///
  /// Similarly vote power computations don't care about start_ts and always
  /// assume the full interval from now to end_ts.
  pub(crate) start_ts: i64,

  /// End of the lockup.
  pub(crate) end_ts: i64,

  /// Type of lockup.
  pub kind: LockupKind,

  // Empty bytes for future upgrades.
  pub reserved: [u8; 15],
}
const_assert!(std::mem::size_of::<Lockup>() == 2 * 8 + 1 + 15);
const_assert!(std::mem::size_of::<Lockup>() % 8 == 0);

impl Default for Lockup {
  fn default() -> Self {
    Self {
      kind: LockupKind::None,
      start_ts: 0,
      end_ts: 0,
      reserved: [0; 15],
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
      reserved: [0; 15],
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

  /// Returns the number of periods left on the lockup.
  /// Returns 0 after lockup has expired and periods_total before start_ts.
  pub fn periods_left(&self, curr_ts: i64) -> Result<u64> {
    let period_secs = self.kind.period_secs();
    if period_secs == 0 {
      return Ok(0);
    }
    if curr_ts < self.start_ts {
      return self.periods_total();
    }
    Ok(
      self
        .seconds_left(curr_ts)
        .checked_add(period_secs.saturating_sub(1))
        .unwrap()
        .checked_div(period_secs)
        .unwrap(),
    )
  }

  /// Returns the current period in the vesting schedule.
  /// Will report periods_total() after lockup has expired and 0 before start_ts.
  pub fn period_current(&self, curr_ts: i64) -> Result<u64> {
    Ok(
      self
        .periods_total()?
        .saturating_sub(self.periods_left(curr_ts)?),
    )
  }

  /// Returns the total amount of periods in the lockup.
  pub fn periods_total(&self) -> Result<u64> {
    let period_secs = self.kind.period_secs();
    if period_secs == 0 {
      return Ok(0);
    }

    let lockup_secs = self.seconds_left(self.start_ts);
    require_eq!(lockup_secs % period_secs, 0, VsrError::InvalidLockupPeriod);

    Ok(lockup_secs.checked_div(period_secs).unwrap())
  }

  /// Remove the vesting periods that are now in the past.
  pub fn remove_past_periods(&mut self, curr_ts: i64) -> Result<()> {
    let periods = self.period_current(curr_ts)?;
    let period_secs = self.kind.period_secs();
    self.start_ts = self
      .start_ts
      .checked_add(i64::try_from(periods.checked_mul(period_secs).unwrap()).unwrap())
      .unwrap();
    require_gte!(self.end_ts, self.start_ts, VsrError::InternalProgramError);
    require_eq!(
      self.period_current(curr_ts)?,
      0,
      VsrError::InternalProgramError
    );
    Ok(())
  }
}

#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, PartialEq)]
pub enum LockupKind {
  /// No lockup, tokens can be withdrawn as long as not engaged in a proposal.
  None,

  /// Lock up for a number of days, no vesting.
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
  use super::*;
  use crate::state::deposit_entry::DepositEntry;

  // intentionally not a multiple of a day
  const MAX_SECS_LOCKED: u64 = 365 * 24 * 60 * 60 + 7 * 60 * 60;
  const MAX_DAYS_LOCKED: f64 = MAX_SECS_LOCKED as f64 / (24.0 * 60.0 * 60.0);

  #[test]
  pub fn period_computations() -> Result<()> {
    let lockup = Lockup::new_from_periods(LockupKind::Cliff, 1000, 1000, 3)?;
    let day = SECS_PER_DAY as i64;
    assert_eq!(lockup.periods_total()?, 3);
    assert_eq!(lockup.period_current(0)?, 0);
    assert_eq!(lockup.periods_left(0)?, 3);
    assert_eq!(lockup.period_current(999)?, 0);
    assert_eq!(lockup.periods_left(999)?, 3);
    assert_eq!(lockup.period_current(1000)?, 0);
    assert_eq!(lockup.periods_left(1000)?, 3);
    assert_eq!(lockup.period_current(1000 + day - 1)?, 0);
    assert_eq!(lockup.periods_left(1000 + day - 1)?, 3);
    assert_eq!(lockup.period_current(1000 + day)?, 1);
    assert_eq!(lockup.periods_left(1000 + day)?, 2);
    assert_eq!(lockup.period_current(1000 + 3 * day - 1)?, 2);
    assert_eq!(lockup.periods_left(1000 + 3 * day - 1)?, 1);
    assert_eq!(lockup.period_current(1000 + 3 * day)?, 3);
    assert_eq!(lockup.periods_left(1000 + 3 * day)?, 0);
    assert_eq!(lockup.period_current(100 * day)?, 3);
    assert_eq!(lockup.periods_left(100 * day)?, 0);
    Ok(())
  }

  #[test]
  pub fn days_left_start() -> Result<()> {
    run_test_days_left(TestDaysLeft {
      expected_days_left: 10,
      days_total: 10.0,
      curr_day: 0.0,
    })
  }

  #[test]
  pub fn days_left_one_half() -> Result<()> {
    run_test_days_left(TestDaysLeft {
      expected_days_left: 10,
      days_total: 10.0,
      curr_day: 0.5,
    })
  }

  #[test]
  pub fn days_left_one() -> Result<()> {
    run_test_days_left(TestDaysLeft {
      expected_days_left: 9,
      days_total: 10.0,
      curr_day: 1.0,
    })
  }

  #[test]
  pub fn days_left_one_and_one_half() -> Result<()> {
    run_test_days_left(TestDaysLeft {
      expected_days_left: 9,
      days_total: 10.0,
      curr_day: 1.5,
    })
  }

  #[test]
  pub fn days_left_9() -> Result<()> {
    run_test_days_left(TestDaysLeft {
      expected_days_left: 1,
      days_total: 10.0,
      curr_day: 9.0,
    })
  }

  #[test]
  pub fn days_left_9_dot_one() -> Result<()> {
    run_test_days_left(TestDaysLeft {
      expected_days_left: 1,
      days_total: 10.0,
      curr_day: 9.1,
    })
  }

  #[test]
  pub fn days_left_9_dot_nine() -> Result<()> {
    run_test_days_left(TestDaysLeft {
      expected_days_left: 1,
      days_total: 10.0,
      curr_day: 9.9,
    })
  }

  #[test]
  pub fn days_left_ten() -> Result<()> {
    run_test_days_left(TestDaysLeft {
      expected_days_left: 0,
      days_total: 10.0,
      curr_day: 10.0,
    })
  }

  #[test]
  pub fn days_left_eleven() -> Result<()> {
    run_test_days_left(TestDaysLeft {
      expected_days_left: 0,
      days_total: 10.0,
      curr_day: 11.0,
    })
  }

  #[test]
  pub fn voting_power_cliff_warmup() -> Result<()> {
    // 10 tokens with 6 decimals.
    let amount_deposited = 10 * 1_000_000;
    let expected_voting_power = locked_cliff_power(amount_deposited, 10.5);
    run_test_voting_power(TestVotingPower {
      expected_voting_power,
      amount_deposited,
      days_total: 10.0,
      curr_day: -0.5,
      kind: LockupKind::Cliff,
    })
  }

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

  struct TestDaysLeft {
    expected_days_left: u64,
    days_total: f64,
    curr_day: f64,
  }

  struct TestVotingPower {
    amount_deposited: u64,
    days_total: f64,
    curr_day: f64,
    expected_voting_power: u64,
    kind: LockupKind,
  }

  fn run_test_days_left(t: TestDaysLeft) -> Result<()> {
    let start_ts = 1634929833;
    let end_ts = start_ts + days_to_secs(t.days_total);
    let curr_ts = start_ts + days_to_secs(t.curr_day);
    let l = Lockup {
      kind: LockupKind::Cliff,
      start_ts,
      end_ts,
      reserved: [0u8; 15],
    };
    let days_left = l.periods_left(curr_ts)?;
    assert_eq!(days_left, t.expected_days_left);
    Ok(())
  }

  fn run_test_voting_power(t: TestVotingPower) -> Result<()> {
    let start_ts = 1634929833;
    let end_ts = start_ts + days_to_secs(t.days_total);
    let d = DepositEntry {
      is_used: true,
      voting_mint_config_idx: 0,
      amount_deposited_native: t.amount_deposited,
      amount_initially_locked_native: t.amount_deposited,
      lockup: Lockup {
        start_ts,
        end_ts,
        kind: t.kind,
        reserved: [0u8; 15],
      },
      reserved: [0; 29],
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
    let relevant_days = if remaining_days < MAX_DAYS_LOCKED as f64 {
      remaining_days
    } else {
      MAX_DAYS_LOCKED as f64
    };
    (amount as f64) * relevant_days / (MAX_DAYS_LOCKED as f64)
  }

  fn locked_cliff_power(amount: u64, remaining_days: f64) -> u64 {
    locked_cliff_power_float(amount, remaining_days).floor() as u64
  }
}
