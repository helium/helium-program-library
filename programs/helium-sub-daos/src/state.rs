use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct DaoV0 {
  pub mint: Pubkey,
  pub authority: Pubkey,
  pub treasury: Pubkey,
  pub num_sub_daos: u32,
  pub reward_per_epoch: u64,
  pub bump_seed: u8,
  pub treasury_bump_seed: u8,
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
  pub hotspot_collection: Pubkey, // The metaplex collection of hotspot NFTs
  pub mint: Pubkey,               // The mint of the subdao token
  pub treasury: Pubkey,           // The treasury for rewards
  pub authority: Pubkey,
  pub total_devices: u64,
  pub bump_seed: u8,
}
