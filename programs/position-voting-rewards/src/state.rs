use anchor_lang::prelude::*;

use crate::{
  error::ErrorCode,
  util::{apply_fall_rate_factor, current_epoch, EPOCH_LENGTH},
};

#[account]
#[derive(Default)]
pub struct EnrolledPositionV0 {
  pub vetoken_tracker: Pubkey,
  pub registrar: Pubkey,
  pub position: Pubkey,
  pub start_ts: i64,
  pub is_rewards_enrolled: bool,
  pub last_claimed_epoch: u64, // the latest epoch not included claimed_epochs_bitmap
  // A bitmap of epochs past last_claimed_epoch (exclusive) that have been claimed.
  // This bitmap gets rotated as last_claimed_epoch increases.
  // This allows for claiming ~128 epochs worth of rewards in parallel.
  pub claimed_epochs_bitmap: u128,
  pub bump_seed: u8,
  pub recent_proposals: Vec<RecentProposal>,
}

#[derive(Default, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct RecentProposal {
  pub proposal: Pubkey,
  pub ts: i64,
}

pub const TESTING: bool = std::option_env!("TESTING").is_some();

impl EnrolledPositionV0 {
  pub fn is_claimed(&self, epoch: u64) -> Result<bool> {
    if epoch <= self.last_claimed_epoch {
      Ok(true)
    } else if epoch > self.last_claimed_epoch + 128 {
      Err(error!(ErrorCode::InvalidClaimEpoch))
    } else {
      let bit_index = (epoch - self.last_claimed_epoch - 1) as u128;
      Ok(self.claimed_epochs_bitmap >> (127_u128 - bit_index) & 1 == 1)
    }
  }

  pub fn set_claimed(&mut self, epoch: u64) -> Result<()> {
    if epoch <= self.last_claimed_epoch {
      Err(error!(ErrorCode::InvalidClaimEpoch))
    } else if epoch > self.last_claimed_epoch + 128 {
      Err(error!(ErrorCode::InvalidClaimEpoch))
    } else {
      let bit_index = (epoch - self.last_claimed_epoch - 1) as u128;
      // Set the bit at bit_index to 1
      self.claimed_epochs_bitmap |= 1_u128 << (127_u128 - bit_index);

      // Shift claimed_epochs_bitmap to the left until the first bit is 0
      while self.claimed_epochs_bitmap & (1_u128 << 127) != 0 {
        self.claimed_epochs_bitmap <<= 1;
        self.last_claimed_epoch += 1;
      }

      Ok(())
    }
  }

  // Add a proposal to the recent proposals list
  pub fn add_recent_proposal(&mut self, proposal: Pubkey, ts: i64) {
    let new_proposal = RecentProposal { proposal, ts };

    // Find the insertion point to maintain descending order by timestamp
    let insert_index = self
      .recent_proposals
      .iter()
      .position(|p| p.ts <= ts)
      .unwrap_or(self.recent_proposals.len());

    // Insert the new proposal
    self.recent_proposals.insert(insert_index, new_proposal);
  }

  pub fn remove_recent_proposal(&mut self, proposal: Pubkey) {
    self.recent_proposals.retain(|p| p.proposal != proposal);
  }

  // Remove proposals older than the given timestamp
  pub fn remove_proposals_older_than(&mut self, ts: i64) {
    self.recent_proposals.retain(|p| p.ts >= ts);
  }
}

#[account]
#[derive(InitSpace)]
pub struct VsrEpochInfoV0 {
  pub epoch: u64,
  pub vetoken_tracker: Pubkey,
  pub registrar: Pubkey,
  pub initialized: bool,
  pub recent_proposals: [Pubkey; 4],
  pub vetokens_at_epoch_start: u128,
  /// The number of enrollment rewards issued this epoch, so that enrollies can claim their share of the rewards
  pub rewards_amount: u64,
  /// The vetokens amount associated with positions that are closing this epoch. This is the amount that will be subtracted from the tracker
  /// total vetokens after the epoch passes. Typically these positions close somewhere between the epoch start and end time, so we cannot rely
  /// on fall rate calculations alone without knowing the exact end date of each position. Instead, just keep track of what needs to be
  /// removed.
  pub vetokens_in_closing_positions: u128,
  /// The vetokens amount that is decaying per second, with 12 decimals of extra precision. Associated with positions that are closing this epoch,
  /// which means they must be subtracted from the total fall rate on the tracker after this epoch passes
  pub fall_rates_from_closing_positions: u128,
  pub bump_seed: u8,
  /// The program only needs to know whether or not rewards were issued, however having a history of when they were issued could prove
  /// useful in the future, or at least for debugging purposes
  pub rewards_issued_at: Option<i64>,
}

#[macro_export]
macro_rules! vsr_epoch_info_seeds {
  ( $ei:expr ) => {
    &[
      b"vsr_epoch_info".as_ref(),
      $ei.vetoken_tracker.as_ref(),
      &$ei.epoch.to_le_bytes(),
      &[$ei.bump_seed],
    ]
  };
}

impl VsrEpochInfoV0 {
  pub fn start_ts(&self) -> i64 {
    i64::try_from(self.epoch).unwrap() * EPOCH_LENGTH
  }

  pub fn end_ts(&self) -> i64 {
    i64::try_from(self.epoch + 1).unwrap() * EPOCH_LENGTH
  }
}

#[account]
#[derive(InitSpace)]
pub struct VeTokenTrackerV0 {
  pub registrar: Pubkey,
  pub rewards_mint: Pubkey,
  pub rewards_authority: Pubkey,
  pub vetoken_last_calculated_ts: i64,
  pub vetoken_fall_rate: u128, // the vetoken amount that the position decays by per second, with 12 decimals of extra precision
  pub total_vetokens: u128, // the total amount of vetoken staked to this subdao, with 12 decimals of extra precision
  pub recent_proposals: [Pubkey; 4],
  pub bump_seed: u8,
}

#[macro_export]
macro_rules! vetoken_tracker_seeds {
  ( $vt:expr ) => {
    &[
      b"vetoken_tracker".as_ref(),
      $vt.registrar.as_ref(),
      &[$vt.bump_seed],
    ]
  };
}

impl VeTokenTrackerV0 {
  pub fn update_vetokens(
    &mut self,
    curr_epoch_info: &mut VsrEpochInfoV0,
    curr_ts: i64,
  ) -> Result<()> {
    if curr_ts < self.vetoken_last_calculated_ts {
      return Ok(());
    }

    msg!(
      "Current vetoken is {} with last updated of {}. Fast forwarding to {} at fall rate {}",
      self.total_vetokens,
      self.vetoken_last_calculated_ts,
      curr_ts,
      self.vetoken_fall_rate
    );

    // If last calculated was more than an epoch ago
    let epoch_start = curr_epoch_info.start_ts();
    if epoch_start
      .checked_sub(self.vetoken_last_calculated_ts)
      .unwrap()
      > EPOCH_LENGTH
      && !TESTING
    // Allow this check to be bypassed when testing so we can run
    // checks against this method without having to update _every_ epoch
    {
      return Err(error!(ErrorCode::MustCalculateVehntLinearly));
    }

    // Step 1. Update veHNT up to the point that this epoch starts
    if epoch_start > self.vetoken_last_calculated_ts {
      let fall = self
        .vetoken_fall_rate
        .checked_mul(
          u128::try_from(epoch_start)
            .unwrap()
            .checked_sub(u128::try_from(self.vetoken_last_calculated_ts).unwrap())
            .unwrap(),
        )
        .unwrap();

      self.total_vetokens = self.total_vetokens.checked_sub(fall).unwrap();
      self.vetoken_last_calculated_ts = epoch_start;
    }

    // If sub dao epoch info account was just created, log the vetoken
    if !curr_epoch_info.initialized {
      msg!("Setting vetoken_at_epoch_start to {}", self.total_vetokens,);
      curr_epoch_info.vetokens_at_epoch_start =
        apply_fall_rate_factor(self.total_vetokens).unwrap();
    }
    // Step 2. Update fall rate according to this epoch's closed position corrections
    if curr_epoch_info.fall_rates_from_closing_positions > 0
      || curr_epoch_info.vetokens_in_closing_positions > 0
    {
      msg!(
        "Correcting fall rate by {} and vetoken by {} due to closed positions",
        curr_epoch_info.fall_rates_from_closing_positions,
        curr_epoch_info.vetokens_in_closing_positions
      );
      self.vetoken_fall_rate = self
        .vetoken_fall_rate
        .checked_sub(curr_epoch_info.fall_rates_from_closing_positions)
        .unwrap();

      self.total_vetokens = self
        .total_vetokens
        .saturating_sub(curr_epoch_info.vetokens_in_closing_positions);
      // Since this has already been applied, set to 0
      curr_epoch_info.fall_rates_from_closing_positions = 0;
      curr_epoch_info.vetokens_in_closing_positions = 0;
    }

    // Step 3. Update veHNT up to now (from start of epoch) using the current fall rate. At this point, closing positions are effectively ignored.
    if current_epoch(curr_ts) == curr_epoch_info.epoch {
      let fall = self
        .vetoken_fall_rate
        .checked_mul(
          u128::try_from(curr_ts)
            .unwrap()
            .checked_sub(
              u128::try_from(std::cmp::max(self.vetoken_last_calculated_ts, epoch_start)).unwrap(),
            )
            .unwrap(),
        )
        .unwrap();

      self.total_vetokens = self.total_vetokens.saturating_sub(fall);
      self.vetoken_last_calculated_ts = curr_ts;
    }

    Ok(())
  }
}
