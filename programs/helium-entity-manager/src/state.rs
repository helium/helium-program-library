use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct HotspotConfigV0 {
  pub dc_fee: u64,        // Data Credit burn amount required for collection item
  pub collection: Pubkey, // The metaplex collection to be issued
  pub dc_mint: Pubkey,
  pub onboarding_server: Pubkey,
  pub authority: Pubkey,
  pub symbol: String,
  pub sub_dao: Pubkey,
  pub merkle_tree: Pubkey,

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
  pub ecc_compact: Vec<u8>,
  pub location: Option<String>,

  pub bump_seed: u8,
}
