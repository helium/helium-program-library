use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct BoostConfigV0 {
  pub price_oracle: Pubkey,
  pub payment_mint: Pubkey,
  pub sub_dao: Pubkey,
  /// Authority to reclaim rent from hexes no longer boosted
  pub rent_reclaim_authority: Pubkey,
  /// The price in the oracle (usd) to burn boost
  /// For simplicity, this should have the same number of decimals as the price oracle
  pub boost_price: u64,
  /// The length of a period (defined as a month in the HIP)
  pub period_length: u32,
  /// The minimum of periods to boost
  pub minimum_periods: u16,
  pub bump_seed: u8,
  /// Authority to start the hex
  pub start_authority: Pubkey,
  pub dc_mint: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq)]
pub enum DeviceTypeV0 {
  #[default]
  CbrsIndoor = 0,
  CbrsOutdoor = 1,
  WifiIndoor = 2,
  WifiOutdoor = 3,
}

#[account]
pub struct BoostedHexV0 {
  pub boost_config: Pubkey,
  pub location: u64,
  // 0 if the boosting has not yet started. Avoding using an option here to keep serialization length
  // consistent
  pub start_ts: i64,
  // Extra space in case we need it later
  pub reserved: [u64; 8],
  pub bump_seed: u8,
  /// Each entry represents the boost multiplier for a given period
  pub boosts_by_period: Vec<u8>,
  // Track changes to the boosted hex so client can pass what version it made a change to
  pub version: u32,
}

#[account]
pub struct BoostedHexV1 {
  pub device_type: DeviceTypeV0,
  pub boost_config: Pubkey,
  // Track changes to the boosted hex so client can pass what version it made a change to
  pub version: u32,
  pub location: u64,
  // 0 if the boosting has not yet started. Avoding using an option here to keep serialization length
  // consistent
  pub start_ts: i64,
  pub bump_seed: u8,
  /// Each entry represents the boost multiplier for a given period
  pub boosts_by_period: Vec<u8>,
}

const JULY_FIRST_2025: i64 = 1751328000;

impl BoostedHexV1 {
  pub fn is_expired(&self, boost_config: &BoostConfigV0) -> bool {
    if self.start_ts == 0 {
      // After july 1st, can close unstarted hexes.
      Clock::get().unwrap().unix_timestamp >= JULY_FIRST_2025
    } else {
      let now = Clock::get().unwrap().unix_timestamp;
      let elapsed_time = now - self.start_ts;
      let elapsed_periods = elapsed_time
        .checked_div(boost_config.period_length as i64)
        .unwrap();

      // This is true so long as there are never any 0's appended to the end
      // of boosts_by_period
      self.start_ts >= JULY_FIRST_2025 || self.boosts_by_period.len() as i64 <= elapsed_periods
    }
  }
}
