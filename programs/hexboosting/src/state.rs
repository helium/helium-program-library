use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct BoostConfigV0 {
  pub price_oracle: Pubkey,
  pub payment_mint: Pubkey,
  pub authority: Pubkey,
  /// The price in the payment_mint to burn boost
  pub boost_price: u64,
  /// The length of a period (defined as a month in the HIP)
  pub period_length: u32,
  /// The minimum of periods to boost
  pub minimum_periods: u16,
  pub bump_seed: u8,
}

#[account]
pub struct BoostedHexV0 {
  pub boost_config: u64,
  pub location: u64,
  // 0 if the boosting has not yet started. Avoding using an option here to keep serialization length
  // consistent
  pub start_ts: i64,
  pub num_periods: u16,
  // Extra space in case we need it later
  pub reserved: [u64; 8],
  pub bump_seed: u8,
  // Not shown: After the account data, the rest of the bytes are used to indicate the boost amount
  // per period after `start_ts`
}
