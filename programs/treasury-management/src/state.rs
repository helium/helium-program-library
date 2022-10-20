use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum Curve {
  // Scale as x^k
  ExponentialCurveV0 { k: u128 },
}

impl Default for Curve {
  fn default() -> Self {
    // Default: Linear
    Curve::ExponentialCurveV0 { k: 1 }
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
  /// Freeze this curve at this time.
  pub freeze_unix_time: i64,

  // Needed to derive the PDA of this instance
  pub bump_seed: u8,
}
