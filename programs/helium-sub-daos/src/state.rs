use anchor_lang::prelude::*;

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
pub struct SubDaoEpochInfoV0 {
  pub epoch: u64,
  pub sub_dao: Pubkey,
  pub total_devices: u64,
  pub dc_burned: u64,
  /// Precise number with 12 decimals
  pub utility_score: Option<u128>,
  pub rewards_issued: bool,
  pub bump_seed: u8,
}

#[account]
#[derive(Default)]
pub struct SubDaoV0 {
  pub dao: Pubkey,
  pub dnt_mint: Pubkey,       // The mint of the subdao token
  pub treasury: Pubkey,       // The treasury of HNT
  pub rewards_escrow: Pubkey, // The escrow account for DNT rewards
  pub authority: Pubkey,
  pub total_devices: u64,
  pub emission_schedule: Vec<EmissionScheduleItem>,
  pub bump_seed: u8,
}
