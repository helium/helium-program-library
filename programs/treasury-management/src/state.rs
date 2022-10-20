use anchor_lang::prelude::*;


#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum Curve {
  // c^k
  ExponentialCurveV0 {
    c: u128,
    k: u128,
  },
}

impl Default for Curve {
  fn default() -> Self {
    Curve::ExponentialCurveV0 {
      c: 1,
      k: 0
    }
  }
}

#[account]
#[derive(Default)]
pub struct TreasuryManagementV0 {
  pub treasury_mint: Pubkey,
  pub supply_mint: Pubkey,
  pub authority: Pubkey,
  pub treasury: Pubkey,
  /// The bonding curve to use
  pub curve: Curve,
  pub go_live_unix_time: i64,

  // Needed to derive the PDA of this instance
  pub bump_seed: u8,

  // Keep track of what the reserves should have if all txns came from bonding
  // This is used for sell frozen bonding curves, where we do not adapt the price based
  // on the actual reserves.
  pub reserve_balance_from_bonding: u64,
  pub supply_from_bonding: u64,
}
