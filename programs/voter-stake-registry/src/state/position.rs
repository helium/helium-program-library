use super::{Lockup, LockupKind, VotingMintConfigV0};
use anchor_lang::prelude::*;
use std::cmp::min;

#[account]
#[derive(Default)]
pub struct PositionV0 {
  pub registrar: Pubkey,
  pub mint: Pubkey,
  // Locked state.
  pub lockup: Lockup,

  /// Amount in deposited, in native currency. Withdraws of vested tokens
  /// directly reduce this amount.
  ///
  /// This directly tracks the total amount added by the user. They may
  /// never withdraw more than this amount.
  pub amount_deposited_native: u64,

  // Points to the VotingMintConfig this position uses.
  pub voting_mint_config_idx: u8,
  // The number of votes this position is active for.
  pub num_active_votes: u16,
  pub genesis_end: i64,
  pub bump_seed: u8,
}

impl PositionV0 {
  /// # Voting Power Caclulation
  ///
  /// Returns the voting power for the deposit, giving locked tokens boosted
  /// voting power that scales linearly with the lockup time.
  ///
  /// For each cliff-locked token, the vote weight is one of these
  ///
  /// If remaining time is > minimum_required_lockup_secs
  /// ```
  ///    voting_power = (locked_vote_weight + (lockup_duration_factor * max_extra_lockup_vote_weight))) * genesis_vote_power_multiplier
  /// ```
  ///
  /// with
  ///   - lockup_duration_factor = min((lockup_time_remaining - minimum_required_lockup_secs) / (lockup_saturation_secs - minimum_required_lockup_secs), 1)
  ///   - the VotingMintConfig providing the values for
  ///     locked_vote_weight, minimum_required_lockup_secs, max_extra_lockup_vote_weight, lockup_saturation_secs, genesis_vote_power_multiplier
  ///
  /// If remaining time is <= minimum_required_lockup_secs
  /// ```
  ///    voting_power = (lockup_duration_factor * locked_vote_weight) * genesis_vote_power_multiplier
  /// ```
  ///
  /// with
  ///   - lockup_duration_factor = min(lockup_time_remaining / minimum_required_lockup_secs, 1)
  ///   - the VotingMintConfig providing the values for
  ///     locked_vote_weight, minimum_required_lockup_secs, genesis_vote_power_multiplier
  ///
  /// ## Cliff Lockup
  ///
  /// The cliff lockup allows one to lockup their tokens for a set period
  /// of time, unlocking all at once on a given date.
  ///
  /// The calculation for this is straightforward and is detailed above.
  ///
  /// ### Decay
  ///
  /// As time passes, the voting power decays until it's back to just
  /// fixed_factor when the cliff has passed. This is important because at
  /// each point in time the lockup should be equivalent to a new lockup
  /// made for the remaining time period.
  ///
  pub fn voting_power(&self, voting_mint_config: &VotingMintConfigV0, curr_ts: i64) -> Result<u64> {
    self.voting_power_with_deposits(voting_mint_config, curr_ts, self.amount_deposited_native)
  }

  pub fn voting_power_with_deposits(
    &self,
    voting_mint_config: &VotingMintConfigV0,
    curr_ts: i64,
    amount_deposited_native: u64,
  ) -> Result<u64> {
    let locked_vote_weight = voting_mint_config.locked_vote_weight(amount_deposited_native)?;

    let voting_power_locked = self.voting_power_locked(
      curr_ts,
      voting_mint_config.minimum_required_lockup_secs,
      locked_vote_weight,
      voting_mint_config.lockup_saturation_secs,
      voting_mint_config.max_extra_lockup_vote_weight_scaled_factor,
      voting_mint_config.genesis_vote_power_multiplier,
    )?;

    Ok(voting_power_locked)
  }

  /// Vote power contribution from locked funds only.
  pub fn voting_power_locked(
    &self,
    curr_ts: i64,
    minimum_required_lockup_secs: u64,
    locked_vote_weight: u64,
    lockup_saturation_secs: u64,
    max_extra_lockup_vote_weight_scaled_factor: u64,
    genesis_vote_power_multiplier: u8,
  ) -> Result<u64> {
    if self.lockup.expired(curr_ts) || (locked_vote_weight == 0) {
      return Ok(0);
    }

    match self.lockup.kind {
      LockupKind::None => Ok(0),
      LockupKind::Cliff => self.voting_power_cliff(
        curr_ts,
        minimum_required_lockup_secs,
        locked_vote_weight,
        lockup_saturation_secs,
        max_extra_lockup_vote_weight_scaled_factor,
        genesis_vote_power_multiplier,
      ),
      LockupKind::Constant => self.voting_power_cliff(
        curr_ts,
        minimum_required_lockup_secs,
        locked_vote_weight,
        lockup_saturation_secs,
        max_extra_lockup_vote_weight_scaled_factor,
        genesis_vote_power_multiplier,
      ),
    }
  }

  fn voting_power_cliff(
    &self,
    curr_ts: i64,
    minimum_required_lockup_secs: u64,
    locked_vote_weight: u64,
    lockup_saturation_secs: u64,
    max_extra_lockup_vote_weight_scaled_factor: u64,
    genesis_vote_power_multiplier: u8,
  ) -> Result<u64> {
    let remaining = min(self.lockup.seconds_left(curr_ts), lockup_saturation_secs);
    let genesis_multiplier = if curr_ts < self.genesis_end && genesis_vote_power_multiplier > 0 {
      genesis_vote_power_multiplier
    } else {
      1
    };

    // from 0 to min lockup is 0.
    // min lockup is 1
    // min lockup to max lockup is 1 + (seconds_passed_min_lockup_initial / seconds_from_min_lockup_to_max_lockup_initial) * (max_extra_lockup_vote_weight_scaled_factor - 1)
    // Current voting power multiplier is the above, scaled by (remaining / total_seconds)
    // = (1 + (seconds_passed_min_lockup_initial / seconds_from_min_lockup_to_max_lockup) * (max_extra_lockup_vote_weight_scaled_factor - 1)) * (remaining / total_seconds)
    // Voting power then is amount staked multiplied by that.
    // To get an accurate read, we must put all multiplied numerators first, then divide.

    let total_seconds = u64::try_from(
      self
        .lockup
        .end_ts
        .checked_sub(self.lockup.start_ts)
        .unwrap(),
    )
    .unwrap();

    if total_seconds < minimum_required_lockup_secs {
      return Ok(0);
    }

    let seconds_passsed_min_lockup_initial = total_seconds
      .checked_sub(minimum_required_lockup_secs)
      .unwrap();

    let seconds_from_min_lockup_to_max_lockup = lockup_saturation_secs
      .checked_sub(minimum_required_lockup_secs)
      .unwrap();

    let first_arg = (locked_vote_weight as u128)
      .checked_mul(remaining as u128)
      .unwrap()
      .checked_div(total_seconds as u128)
      .unwrap();
    let second_arg = (locked_vote_weight as u128)
      .checked_mul(seconds_passsed_min_lockup_initial as u128)
      .unwrap()
      .checked_mul(
        max_extra_lockup_vote_weight_scaled_factor
          .checked_sub(1)
          .unwrap() as u128,
      )
      .unwrap()
      .checked_mul(remaining as u128)
      .unwrap()
      .checked_div(seconds_from_min_lockup_to_max_lockup as u128)
      .unwrap()
      .checked_div(total_seconds as u128)
      .unwrap();

    Ok(
      u64::try_from(
        first_arg
          .checked_add(second_arg)
          .unwrap()
          .checked_mul(genesis_multiplier as u128)
          .unwrap(),
      )
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
