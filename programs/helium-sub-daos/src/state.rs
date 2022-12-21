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
pub struct StakePositionV0 {
  pub hnt_amount: u64,
  pub deposit: u8, // the deposit_entry in vsr that this position is drawing from
  pub sub_dao: Pubkey,
  pub last_claimed_epoch: u64, // the epoch number that the dnt rewards were last claimed at
  pub fall_rate: u64,          // the vehnt amount that the position decays by per second
  pub expiry_ts: i64,
  pub purged: bool, // if true, this position has been removed from subdao calculations. rewards can still be claimed.
}

#[account]
#[derive(Default)]
pub struct SubDaoEpochInfoV0 {
  pub epoch: u64,
  pub sub_dao: Pubkey,
  pub dc_burned: u64,
  pub total_vehnt: u64,
  /// Precise number with 12 decimals
  pub utility_score: Option<u128>,
  pub rewards_issued_at: Option<i64>,
  pub staking_rewards_issued: u64,
  pub bump_seed: u8,
}

#[account]
#[derive(Default)]
pub struct SubDaoV0 {
  pub dao: Pubkey,
  pub dnt_mint: Pubkey,       // Mint of the subdao token
  pub treasury: Pubkey,       // Treasury of HNT
  pub rewards_escrow: Pubkey, // Escrow account for DNT rewards
  pub staker_pool: Pubkey,    // Pool of DNT tokens which veHNT stakers can claim from
  pub vehnt_staked: u64,
  pub vehnt_last_calculated_ts: i64,
  pub vehnt_fall_rate: u64,
  pub authority: Pubkey,
  pub active_device_aggregator: Pubkey,
  pub dc_burn_authority: Pubkey, // Authority to burn data delegated data credits
  pub onboarding_dc_fee: u64,
  pub emission_schedule: Vec<EmissionScheduleItem>,
  pub bump_seed: u8,
}
