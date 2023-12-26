use super::{Lockup, LockupKind, VotingMintConfigV0};
use crate::error::*;
use anchor_lang::prelude::*;
use std::cmp::min;

pub const PRECISION_FACTOR: u128 = 1_000_000_000_000;

#[account]
#[derive(Default)]
pub struct PositionV0 {
  pub registrar: Pubkey,
  pub mint: Pubkey,
  // Locked state.
  pub lockup: Lockup,

  // Amount in deposited, in native currency. Withdraws of vested tokens
  // directly reduce this amount.
  //
  // This directly tracks the total amount added by the user. They may
  // never withdraw more than this amount.
  pub amount_deposited_native: u64,

  // Points to the VotingMintConfig this position uses.
  pub voting_mint_config_idx: u8,
  // The number of votes this position is active for.
  pub num_active_votes: u16,
  pub genesis_end: i64,
  pub bump_seed: u8,
  pub vote_controller: Pubkey,
}

impl PositionV0 {
  // # Voting Power Caclulation
  //
  // Returns the voting power for the position, giving locked tokens boosted
  // voting power that scales linearly with the lockup time.
  //
  // For each cliff-locked token, the vote weight is:
  //
  // ```
  //    voting_power = baseline_vote_weight
  //                   + lockup_duration_factor * max_extra_lockup_vote_weight
  // ```
  //
  // with
  //   - lockup_duration_factor = min(lockup_time_remaining / lockup_saturation_secs, 1)
  //   - the VotingMintConfig providing the values for
  //     baseline_vote_weight, max_extra_lockup_vote_weight, lockup_saturation_secs
  //
  // ## Cliff Lockup
  //
  // The cliff lockup allows one to lockup their tokens for a set period
  // of time, unlocking all at once on a given date.
  //
  // The calculation for this is straightforward and is detailed above.
  //
  // ### Decay
  //
  // As time passes, the voting power decays until it's back to just
  // fixed_factor when the cliff has passed. This is important because at
  // each point in time the lockup should be equivalent to a new lockup
  // made for the remaining time period.
  //
  pub fn voting_power(
    &self,
    voting_mint_config: &VotingMintConfigV0,
    curr_ts: i64,
  ) -> Result<u128> {
    let baseline_vote_weight =
      voting_mint_config.baseline_vote_weight(self.amount_deposited_native)?;
    let max_locked_vote_weight =
      voting_mint_config.max_extra_lockup_vote_weight(self.amount_deposited_native)?;
    let genesis_multiplier =
      if curr_ts < self.genesis_end && voting_mint_config.genesis_vote_power_multiplier > 0 {
        voting_mint_config.genesis_vote_power_multiplier
      } else {
        1
      };

    let locked_vote_weight = self.voting_power_locked(
      curr_ts,
      max_locked_vote_weight,
      voting_mint_config.lockup_saturation_secs,
    )?;

    require_gte!(
      max_locked_vote_weight,
      locked_vote_weight,
      VsrError::InternalErrorBadLockupVoteWeight
    );

    baseline_vote_weight
      .checked_add(locked_vote_weight)
      .unwrap()
      .checked_mul(genesis_multiplier as u128)
      .ok_or_else(|| error!(VsrError::VoterWeightOverflow))
  }

  // Vote power contribution from locked funds only.
  pub fn voting_power_locked(
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
      LockupKind::Cliff => {
        self.voting_power_cliff(curr_ts, max_locked_vote_weight, lockup_saturation_secs)
      }
      LockupKind::Constant => {
        self.voting_power_cliff(curr_ts, max_locked_vote_weight, lockup_saturation_secs)
      }
    }
  }

  fn voting_power_cliff(
    &self,
    curr_ts: i64,
    max_locked_vote_weight: u128,
    lockup_saturation_secs: u64,
  ) -> Result<u128> {
    let remaining = min(self.lockup.seconds_left(curr_ts), lockup_saturation_secs);
    Ok(
      (max_locked_vote_weight as u128)
        .checked_mul(remaining as u128)
        .unwrap()
        .checked_div(lockup_saturation_secs as u128)
        .unwrap(),
    )
  }

  pub fn amount_unlocked(&self, curr_ts: i64) -> u64 {
    if self.lockup.end_ts <= curr_ts {
      self.amount_deposited_native
    } else {
      0
    }
  }

  pub fn amount_locked(&self, curr_ts: i64) -> u64 {
    self
      .amount_deposited_native
      .checked_sub(self.amount_unlocked(curr_ts))
      .unwrap()
  }
}

#[macro_export]
macro_rules! position_seeds {
  ( $position:expr ) => {
    &[
      b"position".as_ref(),
      $position.mint.as_ref(),
      &[$position.bump_seed],
    ]
  };
}
