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
}

impl BoostedHexV0 {
  pub fn is_expired(&self, boost_config: &BoostConfigV0) -> bool {
    if self.start_ts == 0 {
      true
    } else {
      let now = Clock::get().unwrap().unix_timestamp;
      let elapsed_time = now - self.start_ts;
      let elapsed_periods = elapsed_time
        .checked_div(boost_config.period_length as i64)
        .unwrap();

      // This is true so long as there are never any 0's appended to the end
      // of boosts_by_period
      self.boosts_by_period.len() as i64 == elapsed_periods
    }
  }
}
