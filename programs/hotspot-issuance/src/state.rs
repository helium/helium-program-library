use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct HotspotIssuanceV0 {
  pub count: u64, // Track count of issuance
  pub onboarding_server: Pubkey,
  pub collection_mint: Pubkey, // The metaplex collection to be issued
  pub authority: Pubkey,

  pub bump_seed: u8,
}