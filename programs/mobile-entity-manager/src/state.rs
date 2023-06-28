use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct CarrierV0 {
  pub sub_dao: Pubkey,
  pub update_authority: Pubkey,
  pub issuing_authority: Pubkey, // Carrier wallet issuing these hotspots
  pub collection: Pubkey,        // The metaplex collection to be issued to subscribers
  pub escrow: Pubkey,            // The staked escrow account for this carrier
  pub name: String,
  pub merkle_tree: Pubkey,
  pub approved: bool,
  pub collection_bump_seed: u8,
  pub bump_seed: u8,
  pub metadata_url: String,
}

#[macro_export]
macro_rules! carrier_seeds {
  ( $carrier:expr ) => {
    &[
      b"carrier".as_ref(),
      $carrier.sub_dao.as_ref(),
      $carrier.name.as_bytes(),
      &[$carrier.bump_seed],
    ]
  };
}
