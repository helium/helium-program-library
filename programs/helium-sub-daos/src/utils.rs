use crate::{error::ErrorCode, state::*};
use anchor_lang::prelude::*;
use shared_utils::{
  precise_number::PreciseNumber, signed_precise_number::SignedPreciseNumber, TWO_PREC,
};
use std::convert::TryInto;
use time::{Duration, OffsetDateTime};
use voter_stake_registry::state::{DepositEntry, LockupKind, VotingMintConfig};

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

pub trait GetPercent {
  fn get_percent(&self, percent: u8) -> Option<Self>
  where
    Self: Sized;
}

impl<T> GetPercent for T
where
  T: Copy + Into<u128> + TryFrom<u128>,
{
  fn get_percent(&self, percent: u8) -> Option<Self> {
    let num: u128 = (*self).into();
    TryFrom::try_from(
      num
        .checked_mul(percent.try_into().unwrap())
        .unwrap()
        .checked_div(100)
        .unwrap(),
    )
    .ok()
  }
}

pub const EPOCH_LENGTH: i64 = 24 * 60 * 60;

pub fn current_epoch(unix_timestamp: i64) -> u64 {
  (unix_timestamp / (EPOCH_LENGTH)).try_into().unwrap()
}

pub fn next_epoch_ts(unix_timestamp: i64) -> u64 {
  (current_epoch(unix_timestamp) + 1) * u64::try_from(EPOCH_LENGTH).unwrap()
}

pub fn update_subdao_vehnt(sub_dao: &mut SubDaoV0, curr_ts: i64) {
  let fall: u64 = PreciseNumber::new(sub_dao.vehnt_fall_rate.into())
    .unwrap()
    .checked_mul(
      &PreciseNumber::new(
        (curr_ts - sub_dao.vehnt_last_calculated_ts)
          .try_into()
          .unwrap(),
      )
      .unwrap(),
    )
    .unwrap()
    .checked_div(&PreciseNumber::new(FALL_RATE_FACTOR.into()).unwrap())
    .unwrap()
    .to_imprecise()
    .unwrap()
    .try_into()
    .ok()
    .unwrap();

  sub_dao.vehnt_staked = sub_dao.vehnt_staked.checked_sub(fall).unwrap();
  sub_dao.vehnt_last_calculated_ts = curr_ts;
}

pub fn calculate_voting_power(
  d_entry: DepositEntry,
  voting_mint_config: &VotingMintConfig,
  amount_deposited_native: u64,
  amount_initially_locked_native: u64,
  curr_ts: i64,
) -> Result<u64> {
  if voting_mint_config.min_required_lockup_saturation_secs > 0
    && d_entry.lockup.kind == LockupKind::None
  {
    return Ok(0);
  }
  let baseline_vote_weight = voting_mint_config.baseline_vote_weight(amount_deposited_native)?;

  let min_required_locked_vote_weight =
    voting_mint_config.min_required_lockup_vote_weight(amount_initially_locked_native)?;

  let max_locked_vote_weight =
    voting_mint_config.max_extra_lockup_vote_weight(amount_initially_locked_native)?;

  let locked_vote_weight = d_entry.voting_power_locked(
    curr_ts,
    min_required_locked_vote_weight,
    max_locked_vote_weight,
    voting_mint_config.lockup_saturation_secs,
    voting_mint_config.min_required_lockup_saturation_secs,
  )?;

  require_gte!(
    max_locked_vote_weight,
    locked_vote_weight,
    ErrorCode::FailedVotingPowerCalculation,
  );

  baseline_vote_weight
    .checked_add(locked_vote_weight)
    .ok_or_else(|| error!(ErrorCode::FailedVotingPowerCalculation))
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

pub fn find_allocation_index(
  stake_position: &mut StakePositionV0,
  sub_dao_key: Pubkey,
) -> Option<usize> {
  for i in 0..stake_position.allocations.len() {
    if stake_position.allocations[i].sub_dao == Pubkey::default() {
      return Some(i);
    }
    if stake_position.allocations[i].sub_dao == sub_dao_key {
      return Some(i);
    }
  }
  None
}
pub const FALL_RATE_FACTOR: u128 = 1_000_000_000_000_000;

// TODO delete this
pub fn get_percent(num: u64, perc: u8) -> Option<u64> {
  num
    .checked_mul(perc.try_into().unwrap())
    .unwrap()
    .checked_div(100)
}

pub fn calculate_fall_rate(curr_vp: u64, future_vp: u64, num_seconds: u64) -> Option<u64> {
  let diff: u128 = u128::from(curr_vp.checked_sub(future_vp).unwrap())
    .checked_mul(FALL_RATE_FACTOR.into())
    .unwrap(); // add decimals of precision for fall rate calculation

  diff
    .checked_div(num_seconds.into())
    .unwrap()
    .try_into()
    .ok()
}
