use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct HotspotConfigV0 {
  pub collection: Pubkey, // The metaplex collection to be issued
  pub dc_mint: Pubkey,
  pub onboarding_server: Pubkey,
  pub authority: Pubkey,
  pub symbol: String,
  pub sub_dao: Pubkey,
  pub merkle_tree: Pubkey,
  pub min_gain: i32,
  pub max_gain: i32,
  pub full_location_staking_fee: u64,
  pub dataonly_location_staking_fee: u64,

  pub bump_seed: u8,
  pub collection_bump_seed: u8,
}

#[account]
#[derive(Default)]
pub struct HotspotIssuerV0 {
  pub count: u64,             // Track count of issuer
  pub maker: Pubkey,          // Maker issuing these hotspots
  pub hotspot_config: Pubkey, // The HotspotConfigV0 to be issued
  pub authority: Pubkey,

  pub bump_seed: u8,
}

#[account]
#[derive(Default)]
pub struct HotspotStorageV0 {
  pub asset: Pubkey,
  pub hotspot_key: String,

  pub bump_seed: u8,

  pub location: Option<u64>,
  pub elevation: Option<i32>,
  pub gain: Option<i32>,
  pub is_full_hotspot: bool,
}
