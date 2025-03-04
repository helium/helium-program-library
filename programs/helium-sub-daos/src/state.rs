use anchor_lang::prelude::*;

use crate::{error::ErrorCode, EPOCH_LENGTH};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct EmissionScheduleItem {
  pub start_unix_time: i64,
  pub emissions_per_epoch: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct PercentItem {
  pub start_unix_time: i64,
  pub percent: u8, // percent / 100
}

pub trait GetPercent {
  fn get_percent_at(&self, unix_time: i64) -> Option<u8>;
}

impl GetPercent for Vec<PercentItem> {
  // Binary search for the emissions amongst the schedule.
  fn get_percent_at(&self, unix_time: i64) -> Option<u8> {
    if self.is_empty() {
      return None;
    }

    let mut ans: Option<u8> = None;
    let mut low: usize = 0;
    let mut high: usize = self.len() - 1;

    while low <= high {
      let middle = (high + low) / 2;
      if let Some(current) = self.get(middle) {
        // Move to the right side if target time is greater
        if current.start_unix_time <= unix_time {
          ans = Some(current.percent);
          low = middle + 1;
        } else {
          // move left side
          high = middle - 1;
        }
      } else {
        break;
      }
    }

    ans
  }
}

pub trait GetEmissions {
  fn get_emissions_at(&self, unix_time: i64) -> Option<u64>;
}

impl GetEmissions for Vec<EmissionScheduleItem> {
  // Binary search for the emissions amongst the schedule.
  fn get_emissions_at(&self, unix_time: i64) -> Option<u64> {
    if self.is_empty() {
      return None;
    }

    let mut ans: Option<u64> = None;
    let mut low: usize = 0;
    let mut high: usize = self.len() - 1;

    while low <= high {
      let middle = (high + low) / 2;
      if let Some(current) = self.get(middle) {
        // Move to the right side if target time is greater
        if current.start_unix_time <= unix_time {
          ans = Some(current.emissions_per_epoch);
          low = middle + 1;
        } else {
          // move left side
          if middle == 0 {
            break;
          }
          high = middle - 1;
        }
      } else {
        break;
      }
    }

    ans
  }
}

#[account]
#[derive(Default)]
pub struct DaoV0 {
  pub hnt_mint: Pubkey,
  pub dc_mint: Pubkey,
  pub authority: Pubkey,
  pub registrar: Pubkey, // vsr registrar
  pub hst_pool: Pubkey,
  pub net_emissions_cap: u64, // Cap, in HNT, for net emissions
  pub num_sub_daos: u32,
  pub emission_schedule: Vec<EmissionScheduleItem>,
  pub hst_emission_schedule: Vec<PercentItem>,
  pub bump_seed: u8,
  pub rewards_escrow: Pubkey,
  pub delegator_pool: Pubkey,
  pub delegator_rewards_percent: u64, // number between 0 - (100_u64 * 100_000_000). The % of DNT rewards delegators receive with 8 decimal places of accuracy
  pub proposal_namespace: Pubkey,
  pub recent_proposals: [RecentProposal; 4],
}

#[macro_export]
macro_rules! dao_seeds {
  ( $s:expr ) => {
    &[b"dao".as_ref(), $s.hnt_mint.as_ref(), &[$s.bump_seed]]
  };
}

impl DaoV0 {
  pub fn add_recent_proposal(&mut self, proposal: Pubkey, ts: i64) {
    // Don't add the same proposal twice
    if self.recent_proposals.iter().any(|p| p.proposal == proposal) {
      return;
    }

    let new_proposal = RecentProposal { proposal, ts };
    // Find the insertion point to maintain descending order by timestamp
    let insert_index = self
      .recent_proposals
      .iter()
      .position(|p| p.ts <= ts)
      .unwrap_or(self.recent_proposals.len());
    let cloned_proposals = self.recent_proposals.clone();
    // Shift elements to make room for the new proposal
    if insert_index < self.recent_proposals.len() {
      for i in (insert_index + 1..self.recent_proposals.len()).rev() {
        self.recent_proposals[i] = cloned_proposals[i - 1].clone();
      }
      self.recent_proposals[insert_index] = new_proposal;
    } else if ts > self.recent_proposals[self.recent_proposals.len() - 1].ts {
      // If the new proposal is more recent than the oldest one, replace the oldest
      self.recent_proposals[self.recent_proposals.len() - 1] = new_proposal;
    }
    // Re-sort the array to ensure it's in descending order by timestamp
    self.recent_proposals.sort_by(|a, b| b.ts.cmp(&a.ts));
  }
}

#[account]
#[derive(Default)]
pub struct DaoEpochInfoV0 {
  pub done_calculating_scores: bool, // don't insert state before this, clockwork reads from offset
  pub epoch: u64,
  pub dao: Pubkey,
  pub total_rewards: u64,
  pub current_hnt_supply: u64,
  /// Precise number with 12 decimals
  pub total_utility_score: u128,
  pub num_utility_scores_calculated: u32,
  pub num_rewards_issued: u32,
  pub done_issuing_rewards: bool,
  pub done_issuing_hst_pool: bool,
  pub bump_seed: u8,
  pub recent_proposals: [RecentProposal; 4],
  // The number of delegation rewards issued this epoch, so that delegators can claim their share of the rewards
  pub delegation_rewards_issued: u64,
  pub vehnt_at_epoch_start: u64,
}

#[derive(Debug, InitSpace, Clone, AnchorSerialize, AnchorDeserialize, Default)]
pub struct RecentProposal {
  pub proposal: Pubkey,
  pub ts: i64,
}

const ONE_WEEK: i64 = 60 * 60 * 24 * 7;
impl RecentProposal {
  pub fn is_in_progress(&self, curr_ts: i64) -> bool {
    self.ts + ONE_WEEK > curr_ts
  }
}

impl DaoEpochInfoV0 {
  pub fn size() -> usize {
    60 + 8 + std::mem::size_of::<DaoEpochInfoV0>()
  }

  pub fn start_ts(&self) -> i64 {
    i64::try_from(self.epoch).unwrap() * EPOCH_LENGTH
  }

  pub fn end_ts(&self) -> i64 {
    i64::try_from(self.epoch + 1).unwrap() * EPOCH_LENGTH
  }
}

#[account]
#[derive(Default)]
pub struct DelegatedPositionV0 {
  pub mint: Pubkey,
  pub position: Pubkey,
  pub hnt_amount: u64,
  pub sub_dao: Pubkey,
  pub last_claimed_epoch: u64, // the latest epoch not included claimed_epochs_bitmap
  pub start_ts: i64,
  pub purged: bool, // if true, this position has been removed from subdao calculations. rewards can still be claimed.
  pub bump_seed: u8,
  // A bitmap of epochs past last_claimed_epoch (exclusive) that have been claimed.
  // This bitmap gets rotated as last_claimed_epoch increases.
  // This allows for claiming ~128 epochs worth of rewards in parallel.
  pub claimed_epochs_bitmap: u128,
  pub expiration_ts: i64,
  pub recent_proposals: Vec<RecentProposal>,
}

impl DelegatedPositionV0 {
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

  pub fn set_unclaimed(&mut self, epoch: u64) -> Result<()> {
    while epoch <= self.last_claimed_epoch {
      self.last_claimed_epoch -= 1;
      if self.claimed_epochs_bitmap & 1 != 0 {
        return Err(error!(ErrorCode::InvalidClaimEpoch));
      }
      self.claimed_epochs_bitmap >>= 1;
    }

    let bit_index = (epoch - self.last_claimed_epoch - 1) as u128;
    // Clear the bit at bit_index
    self.claimed_epochs_bitmap &= !(1_u128 << (127_u128 - bit_index));
    Ok(())
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
#[derive(Default)]
pub struct SubDaoEpochInfoV0 {
  pub epoch: u64,
  pub sub_dao: Pubkey,
  pub dc_burned: u64,
  pub vehnt_at_epoch_start: u64,
  /// The vehnt amount associated with positions that are closing this epoch. This is the amount that will be subtracted from the subdao
  /// total vehnt after the epoch passes. Typically these positions close somewhere between the epoch start and end time, so we cannot rely
  /// on fall rate calculations alone without knowing the exact end date of each position. Instead, just keep track of what needs to be
  /// removed.
  pub vehnt_in_closing_positions: u128,
  /// The vehnt amount that is decaying per second, with 12 decimals of extra precision. Associated with positions that are closing this epoch,
  /// which means they must be subtracted from the total fall rate on the subdao after this epoch passes
  pub fall_rates_from_closing_positions: u128,
  /// The number of delegation rewards issued this epoch, so that delegators can claim their share of the rewards
  pub delegation_rewards_issued: u64,
  /// Precise number with 12 decimals
  pub utility_score: Option<u128>,
  /// The program only needs to know whether or not rewards were issued, however having a history of when they were issued could prove
  /// useful in the future, or at least for debugging purposes
  pub rewards_issued_at: Option<i64>,
  pub bump_seed: u8,
  pub initialized: bool,
  pub dc_onboarding_fees_paid: u64,
  /// The number of hnt rewards issued to the reward escrow this epoch
  pub hnt_rewards_issued: u64,
  pub previous_percentage: u32,
}

impl SubDaoEpochInfoV0 {
  pub const SIZE: usize = 60 + 8 + std::mem::size_of::<SubDaoEpochInfoV0>() - 8 - 8 - 8; // subtract 8 the extra u64 we added to vehnt, dc onboarding fees paid, hnt rewards issued, and prev percentage
}
impl SubDaoEpochInfoV0 {
  pub fn start_ts(&self) -> i64 {
    i64::try_from(self.epoch).unwrap() * EPOCH_LENGTH
  }

  pub fn end_ts(&self) -> i64 {
    i64::try_from(self.epoch + 1).unwrap() * EPOCH_LENGTH
  }
}

#[account]
#[derive(Default)]
pub struct SubDaoV0 {
  pub dao: Pubkey,
  pub dnt_mint: Pubkey,       // Mint of the subdao token
  pub treasury: Pubkey,       // Treasury of HNT
  pub rewards_escrow: Pubkey, // Escrow account for DNT rewards
  /// DEPRECATED: use dao.delegator_pool instead. But some people still need to claim old DNT rewards
  pub delegator_pool: Pubkey, // Pool of DNT tokens which veHNT delegators can claim from
  pub vehnt_delegated: u128, // the total amount of vehnt delegated to this subdao, with 12 decimals of extra precision
  pub vehnt_last_calculated_ts: i64,
  pub vehnt_fall_rate: u128, // the vehnt amount that the position decays by per second, with 12 decimals of extra precision
  pub authority: Pubkey,
  pub _deprecated_active_device_aggregator: Pubkey,
  pub dc_burn_authority: Pubkey, // Authority to burn data delegated data credits
  pub onboarding_dc_fee: u64,
  pub emission_schedule: Vec<EmissionScheduleItem>,
  pub bump_seed: u8,
  pub registrar: Pubkey,                          // vsr registrar
  pub _deprecated_delegator_rewards_percent: u64, // number between 0 - (100_u64 * 100_000_000). The % of DNT rewards delegators receive with 8 decimal places of accuracy
  pub onboarding_data_only_dc_fee: u64,
  pub dc_onboarding_fees_paid: u64, // the total amount of dc onboarding fees paid to this subdao by active hotspots (inactive hotspots are excluded)
  pub active_device_authority: Pubkey, // authority that can mark hotspots as active/inactive
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_claimed() {
    let mut position = DelegatedPositionV0::default();
    let mut epoch = 2;

    assert!(!position.is_claimed(epoch).unwrap());
    position.set_claimed(epoch).unwrap();
    assert!(position.is_claimed(epoch).unwrap());
    assert_eq!(position.last_claimed_epoch, 0);

    epoch = 1;
    assert!(!position.is_claimed(epoch).unwrap());
    position.set_claimed(epoch).unwrap();
    assert!(position.is_claimed(epoch).unwrap());
    assert_eq!(position.last_claimed_epoch, 2);
    assert_eq!(position.claimed_epochs_bitmap, 0);
  }

  #[test]
  fn test_unclaimed() {
    let mut position = DelegatedPositionV0::default();
    let epoch = 1;

    // First claim the epoch
    position.set_claimed(epoch).unwrap();
    assert!(position.is_claimed(epoch).unwrap());
    assert!(position.last_claimed_epoch == 1);

    // Then unclaim it
    position.set_unclaimed(epoch).unwrap();
    assert!(!position.is_claimed(epoch).unwrap());
    assert!(!position.is_claimed(epoch + 1).unwrap());
    assert!(position.last_claimed_epoch == 0);
    assert!(position.claimed_epochs_bitmap == 0);

    let epoch = 2;
    position.set_claimed(epoch).unwrap();
    assert!(position.is_claimed(epoch).unwrap());
    assert!(position.last_claimed_epoch == 0);

    // Then unclaim it
    position.set_unclaimed(epoch).unwrap();
    assert!(!position.is_claimed(epoch).unwrap());
    assert!(position.last_claimed_epoch == 0);
    assert!(position.claimed_epochs_bitmap == 0);
  }
}
