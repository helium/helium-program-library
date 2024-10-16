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
  pub hexboost_authority: Pubkey,
  // The percentage of the SP rewards that are allocated to the incentive fund, in basis points
  pub incentive_escrow_fund_bps: u16,
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

#[account]
#[derive(Default)]
pub struct IncentiveEscrowProgramV0 {
  pub carrier: Pubkey,
  pub start_ts: i64,
  pub stop_ts: i64,
  // Shares are summed as a total of all incentive escrow funds under a carrier
  pub shares: u32,
  pub bump_seed: u8,
  pub name: String,
}
