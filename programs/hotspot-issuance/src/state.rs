use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct HotspotIssuanceV0 {
  pub count: u64, // Track count of issuance
  pub collection: Pubkey, // The metaplex collection of hotspot NFTs to be issued
  pub authority: Pubkey,
  
  pub bump_seed: u8,
}