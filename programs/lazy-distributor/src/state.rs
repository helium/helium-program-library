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
  pub rewards_escrow: Pubkey,
  pub authority: Pubkey,
  pub oracles: Vec<OracleConfigV0>,
  pub bump_seed: u8,
  // Optional approver of every set current rewards tx. Use if you want to require calls to proxy throuh another contract
  pub approver: Option<Pubkey>,
}

#[account]
#[derive(Default)]
pub struct RecipientV0 {
  pub lazy_distributor: Pubkey,
  // Attach to the mint of the NFT or asset id of compressed nft. Always pay to the owner of the NFT
  pub asset: Pubkey,
  pub total_rewards: u64, // this is the amount that has been claimed by the recipient
  pub current_config_version: u16,
  pub current_rewards: Vec<Option<u64>>, // One for each oracle, matching indexes in` LazyDistrubutorV0`
  pub bump_seed: u8,
  /// Pubkey::Default if not being used.
  pub destination: Pubkey,
}
