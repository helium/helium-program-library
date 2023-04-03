use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct PriceOracleV0 {
  pub authority: Pubkey,
  pub num_oracles: u8,
  pub decimals: u8,
  pub oracles: Vec<OracleV0>,
  pub current_price: Option<u64>,
  pub last_calculated_timestamp: Option<i64>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct OracleV0 {
  pub authority: Pubkey,
  pub last_submitted_timestamp: Option<i64>,
  pub last_submitted_price: Option<u64>,
}
