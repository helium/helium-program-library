use anchor_lang::prelude::*;

use crate::EPOCH_LENGTH;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct EmissionScheduleItem {
  pub start_unix_time: i64,
  pub emissions_per_epoch: u64,
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
  pub num_sub_daos: u32,
  pub emission_schedule: Vec<EmissionScheduleItem>,
  pub bump_seed: u8,
}

#[account]
#[derive(Default)]
pub struct DaoEpochInfoV0 {
  pub epoch: u64,
  pub dao: Pubkey,
  /// Precise number with 12 decimals
  pub total_utility_score: u128,
  pub num_utility_scores_calculated: u32,
  pub num_rewards_issued: u32,
  pub done_issuing_rewards: bool,
  pub bump_seed: u8,
}

#[account]
#[derive(Default)]
pub struct DelegatedPositionV0 {
  pub mint: Pubkey,
  pub position: Pubkey,
  pub hnt_amount: u64,
  pub sub_dao: Pubkey,
  pub last_claimed_epoch: u64, // the epoch number that the dnt rewards were last claimed at
  pub fall_rate: u128, // the vehnt amount that the position decays by per second, with 12 decimals of extra precision
  pub expiry_ts: i64,
  pub purged: bool, // if true, this position has been removed from subdao calculations. rewards can still be claimed.
  pub bump_seed: u8,
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
  pub vehnt_in_closing_positions: u64,
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
  pub delegator_pool: Pubkey, // Pool of DNT tokens which veHNT delegators can claim from
  pub vehnt_delegated: u64,
  pub vehnt_last_calculated_ts: i64,
  pub vehnt_fall_rate: u128, // the vehnt amount that the position decays by per second, with 12 decimals of extra precision
  pub authority: Pubkey,
  pub active_device_aggregator: Pubkey,
  pub dc_burn_authority: Pubkey, // Authority to burn data delegated data credits
  pub onboarding_dc_fee: u64,
  pub emission_schedule: Vec<EmissionScheduleItem>,
  pub bump_seed: u8,
}
