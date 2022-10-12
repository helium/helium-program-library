use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct OracleConfigV0 {
  pub oracle: Pubkey,
  pub url: String,
}

#[account]
#[derive(Default)]
pub struct LazyDistributorV0 {
  pub version: u16, // Track version so we can invalidate all reward receipts if the config changes
  pub rewards_mint: Pubkey,
  pub authority: Pubkey,
  pub oracles: Vec<OracleConfigV0>,
  pub bump_seed: u8,
}

#[account]
#[derive(Default)]
pub struct RecipientV0 {
  pub lazy_distributor: Pubkey,
  pub mint: Pubkey, // Attach to the mint of the NFT. Always pay to the owner of the NFT
  pub total_rewards: u64,
  pub current_config_version: u16,
  pub current_rewards: Vec<Option<u64>>, // One for each oracle, matching indexes in` LazyDistrubutorV0`
  pub bump_seed: u8,
}
