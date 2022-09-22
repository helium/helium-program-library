use anchor_lang::prelude::*;


#[account]
#[derive(Default)]
pub struct DaoV0 {
  pub mint: Pubkey,
  pub authority: Pubkey,
  pub bump_seed: u8,
  pub treasury: Pubkey,
}

#[account]
#[derive(Default)]
pub struct SubDaoEpochInfoV0 {
  pub sub_dao: Pubkey,
  pub total_devices: u64,
  pub dc_burned: u64,
  pub bump_seed: u8,
}

#[account]
#[derive(Default)]
pub struct SubDaoV0 {
  pub dao: Pubkey,
  pub hotspot_collection: Pubkey, // The metaplex collection of hotspot NFTs
  pub mint: Pubkey, // The mint of the subdao token
  pub treasury: Pubkey, // The treasury for rewards
  pub authority: Pubkey,
  pub total_devices: u64,
  pub bump_seed: u8,
}
