use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct HotspotIssuerV0 {
  pub count: u64, // Track count of issuer
  pub dc_amount: u128, // Data Credit burn amount required for mint & claim
  pub onboarding_server: Pubkey,
  pub collection: Pubkey, // The metaplex collection to be issued
  pub authority: Pubkey,

  pub bump_seed: u8,
  pub collection_bump_seed: u8,
}