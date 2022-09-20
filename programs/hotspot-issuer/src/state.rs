use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct HotspotIssuerV0 {
  pub count: u64, // Track count of issuer
  pub onboarding_server: Pubkey,
  pub collection: Pubkey, // The metaplex collection to be issued
  pub authority: Pubkey,

  pub bump_seed: u8,
}