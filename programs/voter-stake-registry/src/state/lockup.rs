use crate::error::*;
use anchor_lang::prelude::*;
use std::convert::TryFrom;

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
#[derive(Default, AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub enum LockupKind {
  /// No lockup, tokens can be withdrawn as long as not engaged in a proposal.
  #[default]
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
